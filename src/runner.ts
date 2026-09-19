import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { analyzeTypeScriptFiles } from "./analyzer.js";
import type { CliOptions, SeverityLevel } from "./cli.js";
import {
	type Config,
	type IgnoreRule,
	loadConfig,
	matchEndpointPattern,
	normalizeIgnoreRules,
	severityLevelSchema,
} from "./config.js";
import { findLocationViolations, type LocationViolation } from "./locations.js";
import { loadOpenAPISpec, parseOpenAPISpec } from "./openapi-parser.js";
import {
	formatIgnoredEndpoints,
	formatLocationViolations,
	formatSourceSummary,
	formatSummary,
	formatTree,
	formatUnmatchedIgnoreWarnings,
	generateJsonOutput,
	getUnusedEndpoints,
} from "./output.js";
import type { Usage } from "./types.js";

export interface RunResult {
	success: boolean;
	exitCode: number;
	error?: string;
}

interface ResolvedOptions {
	openapiPath: string;
	/** 解析対象ディレクトリの絶対パス */
	srcPaths: string[];
	/** 解析対象ディレクトリのcwd相対パス（使用箇所のfileと同じ基準） */
	srcRelPaths: string[];
	output?: string;
	check?: boolean;
	level: SeverityLevel;
	ignoreRules: IgnoreRule[];
	locations: Record<string, string[]>;
	/** --check で config の output を無視した場合はtrue */
	skippedConfigOutput: boolean;
}

function toArray(value?: string | string[]): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function mergeOptions(
	cliOptions: CliOptions,
	config: Config,
): ResolvedOptions | { error: string } {
	const openapi = cliOptions.openapi ?? config.openapi;
	const srcInputs = toArray(cliOptions.src ?? config.src);

	if (!openapi) {
		return {
			error: "OpenAPI spec path is required (--openapi or config file)",
		};
	}
	if (srcInputs.length === 0) {
		return { error: "Source directory is required (--src or config file)" };
	}

	const levelResult = severityLevelSchema.safeParse(
		cliOptions.level ?? config.level ?? "error",
	);
	if (!levelResult.success) {
		return { error: levelResult.error.issues[0].message };
	}

	// --check はファイルを書き換えない: 明示的な --output のみ尊重する
	const skippedConfigOutput = Boolean(
		cliOptions.check && !cliOptions.output && config.output,
	);
	const output =
		cliOptions.output ?? (cliOptions.check ? undefined : config.output);

	const srcPaths = srcInputs.map((src) => resolve(process.cwd(), src));

	return {
		openapiPath: resolve(process.cwd(), openapi),
		srcPaths,
		srcRelPaths: srcPaths.map((srcPath) => relative(process.cwd(), srcPath)),
		output,
		check: cliOptions.check,
		level: levelResult.data,
		ignoreRules: normalizeIgnoreRules(config.ignore ?? []),
		locations: config.locations ?? {},
		skippedConfigOutput,
	};
}

function validatePaths(openapiPath: string, srcPaths: string[]): string | null {
	if (!existsSync(openapiPath)) {
		return `OpenAPI spec not found: ${openapiPath}`;
	}
	for (const srcPath of srcPaths) {
		if (!existsSync(srcPath)) {
			return `Source directory not found: ${srcPath}`;
		}
	}
	return null;
}

function writeJsonOutput(
	outputPath: string,
	usages: Map<string, Usage[]>,
	ignored: Map<string, IgnoreRule>,
): void {
	const resolvedPath = resolve(process.cwd(), outputPath);
	const outputDir = dirname(resolvedPath);

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const jsonOutput = generateJsonOutput(usages, ignored);
	writeFileSync(resolvedPath, JSON.stringify(jsonOutput, null, 2));
	console.log(`Output written to: ${resolvedPath}`);
}

function printLines(lines: string[]): void {
	for (const line of lines) {
		console.log(line);
	}
}

interface IgnoreResult {
	/** ignoreされなかったエンドポイント */
	kept: Map<string, Usage[]>;
	/** ignoreされたエンドポイント → 適用されたルール */
	ignored: Map<string, IgnoreRule>;
	/** どのエンドポイントにもマッチしなかったルール */
	unmatched: IgnoreRule[];
}

/**
 * ignoreルールを適用し、マッチ数0のルールを検出する
 * @param usages - エンドポイントごとの使用箇所マップ
 * @param rules - 正規化済みignoreルール
 * @returns 残ったエンドポイント、ignore済みエンドポイント、未マッチルール
 */
export function applyIgnoreRules(
	usages: Map<string, Usage[]>,
	rules: IgnoreRule[],
): IgnoreResult {
	const kept = new Map<string, Usage[]>();
	const ignored = new Map<string, IgnoreRule>();
	const matchedRules = new Set<IgnoreRule>();

	for (const [endpoint, usageList] of usages) {
		const matching = rules.filter((rule) =>
			matchEndpointPattern(endpoint, rule.pattern),
		);

		for (const rule of matching) {
			matchedRules.add(rule);
		}

		if (matching.length === 0) {
			kept.set(endpoint, usageList);
		} else {
			ignored.set(endpoint, matching[0]);
		}
	}

	return {
		kept,
		ignored,
		unmatched: rules.filter((rule) => !matchedRules.has(rule)),
	};
}

/**
 * API使用状況解析を実行する
 * @param options - CLIオプション（OpenAPIパス、ソースパス等）
 * @returns 実行結果（成功/失敗、終了コード、エラーメッセージ）
 */
export function run(options: CliOptions): RunResult {
	const configResult = loadConfig(options.config);
	if (!configResult.success) {
		console.error(`Error: ${configResult.error}`);
		return { success: false, exitCode: 1, error: configResult.error };
	}

	for (const warning of configResult.warnings) {
		console.warn(`Warning: ${warning}`);
	}

	const resolved = mergeOptions(options, configResult.config);
	if ("error" in resolved) {
		console.error(`Error: ${resolved.error}`);
		return { success: false, exitCode: 1, error: resolved.error };
	}

	const {
		openapiPath,
		srcPaths,
		srcRelPaths,
		output,
		check,
		level,
		ignoreRules,
		locations,
		skippedConfigOutput,
	} = resolved;

	const validationError = validatePaths(openapiPath, srcPaths);
	if (validationError) {
		console.error(`Error: ${validationError}`);
		return { success: false, exitCode: 1, error: validationError };
	}

	console.log(`Parsing OpenAPI spec: ${openapiPath}`);

	const specResult = loadOpenAPISpec(openapiPath);
	if (!specResult.success) {
		console.error(`Error: ${specResult.error}`);
		return { success: false, exitCode: 1, error: specResult.error };
	}

	const endpoints = parseOpenAPISpec(specResult.spec);
	console.log(`Found ${endpoints.size} endpoints`);

	console.log(`Analyzing source files: ${srcRelPaths.join(", ")}`);
	const rawUsages = analyzeTypeScriptFiles(endpoints, {
		srcPaths,
		basePath: process.cwd(),
	});

	const { kept, ignored, unmatched } = applyIgnoreRules(rawUsages, ignoreRules);

	if (ignored.size > 0) {
		console.log(`Ignored ${ignored.size} endpoints`);
	}
	for (const warning of formatUnmatchedIgnoreWarnings(unmatched)) {
		console.warn(warning);
	}

	// ignore は未使用検知の除外設定なので、位置ルールは全呼び出し箇所に適用する
	const violations = findLocationViolations(rawUsages, locations);

	if (skippedConfigOutput) {
		console.log(
			"Skipped writing output file in check mode (pass --output to write it)",
		);
	}
	if (output) {
		writeJsonOutput(output, kept, ignored);
	}

	if (check) {
		console.log();
		printLines(formatSummary(kept));
		printLines(formatSourceSummary(kept, srcRelPaths));
		printLines(formatLocationViolations(violations));
		return {
			success: true,
			exitCode: shouldFail(kept, violations, level) ? 1 : 0,
		};
	}

	if (!output) {
		console.log();
		printLines(formatTree(kept));
		printLines(formatSummary(kept));
		printLines(formatSourceSummary(kept, srcRelPaths));
		printLines(formatIgnoredEndpoints(ignored));
		printLines(formatLocationViolations(violations));
	}

	return { success: true, exitCode: 0 };
}

function shouldFail(
	usages: Map<string, Usage[]>,
	violations: LocationViolation[],
	level: SeverityLevel,
): boolean {
	if (level !== "error") return false;
	return getUnusedEndpoints(usages).length > 0 || violations.length > 0;
}
