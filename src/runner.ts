import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { analyzeTypeScriptFiles } from "./analyzer.js";
import type { CliOptions } from "./cli.js";
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

function resolvePaths(options: CliOptions): {
	openapiPath: string;
	srcPath: string;
} {
	return {
		openapiPath: resolve(process.cwd(), options.openapi),
		srcPath: resolve(process.cwd(), options.src),
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

/**
 * API使用状況解析を実行する
 * @param options - CLIオプション（OpenAPIパス、ソースパス等）
 * @returns 実行結果（成功/失敗、終了コード、エラーメッセージ）
 */
export function run(options: CliOptions): RunResult {
	const { openapiPath, srcPath } = resolvePaths(options);

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
	const usages = analyzeTypeScriptFiles(endpoints, { srcPath });

	if (options.output) {
		writeJsonOutput(options.output, usages);
	}

	if (options.check) {
		printUsageReport(usages);
		const exitCode = getUnusedEndpoints(usages).length > 0 ? 1 : 0;
		return { success: true, exitCode };
	}

	if (!options.output && !options.check) {
		printUsageReport(usages);
	}

	return { success: true, exitCode: 0 };
}
