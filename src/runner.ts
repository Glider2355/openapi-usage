import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { analyzeTypeScriptFiles } from "./analyzer.js";
import type { CliOptions, SeverityLevel } from "./cli.js";
import { type Config, isIgnored, loadConfig } from "./config.js";
import { loadOpenAPISpec, parseOpenAPISpec } from "./openapi-parser.js";
import {
	formatSummary,
	formatTree,
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
	srcPath: string;
	output?: string;
	check?: boolean;
	level: SeverityLevel;
	ignore: string[];
}

function mergeOptions(
	cliOptions: CliOptions,
	config: Config,
): ResolvedOptions | { error: string } {
	const openapi = cliOptions.openapi ?? config.openapi;
	const src = cliOptions.src ?? config.src;

	if (!openapi) {
		return {
			error: "OpenAPI spec path is required (--openapi or config file)",
		};
	}
	if (!src) {
		return { error: "Source directory is required (--src or config file)" };
	}

	return {
		openapiPath: resolve(process.cwd(), openapi),
		srcPath: resolve(process.cwd(), src),
		output: cliOptions.output ?? config.output,
		check: cliOptions.check,
		level: cliOptions.level ?? config.level ?? "error",
		ignore: config.ignore ?? [],
	};
}

function validatePaths(openapiPath: string, srcPath: string): string | null {
	if (!existsSync(openapiPath)) {
		return `OpenAPI spec not found: ${openapiPath}`;
	}
	if (!existsSync(srcPath)) {
		return `Source directory not found: ${srcPath}`;
	}
	return null;
}

function writeJsonOutput(
	outputPath: string,
	usages: Map<string, Usage[]>,
): void {
	const resolvedPath = resolve(process.cwd(), outputPath);
	const outputDir = dirname(resolvedPath);

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const jsonOutput = generateJsonOutput(usages);
	writeFileSync(resolvedPath, JSON.stringify(jsonOutput, null, 2));
	console.log(`Output written to: ${resolvedPath}`);
}

function printUsageReport(usages: Map<string, Usage[]>): void {
	console.log();
	for (const line of formatTree(usages)) {
		console.log(line);
	}
	for (const line of formatSummary(usages)) {
		console.log(line);
	}
}

function filterIgnoredEndpoints(
	usages: Map<string, Usage[]>,
	ignorePatterns: string[],
): Map<string, Usage[]> {
	if (ignorePatterns.length === 0) {
		return usages;
	}

	const filtered = new Map<string, Usage[]>();
	for (const [endpoint, usageList] of usages) {
		if (!isIgnored(endpoint, ignorePatterns)) {
			filtered.set(endpoint, usageList);
		}
	}
	return filtered;
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

	const resolved = mergeOptions(options, configResult.config);
	if ("error" in resolved) {
		console.error(`Error: ${resolved.error}`);
		return { success: false, exitCode: 1, error: resolved.error };
	}

	const { openapiPath, srcPath, output, check, level, ignore } = resolved;

	const validationError = validatePaths(openapiPath, srcPath);
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

	console.log(`Analyzing source files: ${srcPath}`);
	const rawUsages = analyzeTypeScriptFiles(endpoints, { srcPath });
	const usages = filterIgnoredEndpoints(rawUsages, ignore);

	if (ignore.length > 0) {
		const ignoredCount = rawUsages.size - usages.size;
		if (ignoredCount > 0) {
			console.log(`Ignored ${ignoredCount} endpoints`);
		}
	}

	if (output) {
		writeJsonOutput(output, usages);
	}

	if (check) {
		const unusedEndpoints = getUnusedEndpoints(usages);
		console.log();
		for (const line of formatSummary(usages)) {
			console.log(line);
		}
		const exitCode = unusedEndpoints.length > 0 && level === "error" ? 1 : 0;
		return { success: true, exitCode };
	}

	if (!output && !check) {
		printUsageReport(usages);
	}

	return { success: true, exitCode: 0 };
}
