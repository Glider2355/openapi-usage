import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { analyzeTypeScriptFiles } from "./analyzer.js";
import { parseOpenAPISpec } from "./openapi-parser.js";
import {
	formatSummary,
	formatTree,
	generateJsonOutput,
	getUnusedEndpoints,
} from "./output.js";
import type { OpenAPISpec, Usage } from "./types.js";

const program = new Command();

program
	.name("openapi-usage")
	.description("Analyze API usage based on OpenAPI spec")
	.requiredOption("-o, --openapi <path>", "Path to OpenAPI spec file")
	.requiredOption("-s, --src <path>", "Path to source directory")
	.option("--output <path>", "Output JSON file path")
	.option("--check", "Check mode (exit 1 if unused APIs exist)");

program.parse();

const options = program.opts<{
	openapi: string;
	src: string;
	output?: string;
	check?: boolean;
}>();

// Resolve paths
const openapiPath = resolve(process.cwd(), options.openapi);
const srcPath = resolve(process.cwd(), options.src);

// Validate paths
if (!existsSync(openapiPath)) {
	console.error(`Error: OpenAPI spec not found: ${openapiPath}`);
	process.exit(1);
}

if (!existsSync(srcPath)) {
	console.error(`Error: Source directory not found: ${srcPath}`);
	process.exit(1);
}

// Parse OpenAPI spec
console.log(`Parsing OpenAPI spec: ${openapiPath}`);
let spec: OpenAPISpec;
try {
	const content = readFileSync(openapiPath, "utf-8");
	spec = JSON.parse(content);
} catch (error) {
	if (error instanceof SyntaxError) {
		console.error(`Error: Invalid JSON in OpenAPI spec: ${error.message}`);
	} else {
		console.error(
			`Error: Failed to read OpenAPI spec: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	process.exit(1);
}
const endpoints = parseOpenAPISpec(spec);
console.log(`Found ${endpoints.size} endpoints`);

// Analyze TypeScript files
console.log(`Analyzing source files: ${srcPath}`);
const usages = analyzeTypeScriptFiles(endpoints, {
	srcPath,
});

// Output
if (options.output) {
	const outputPath = resolve(process.cwd(), options.output);
	const outputDir = dirname(outputPath);

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const jsonOutput = generateJsonOutput(usages);
	writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
	console.log(`Output written to: ${outputPath}`);
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

if (options.check) {
	printUsageReport(usages);
	const exitCode = getUnusedEndpoints(usages).length > 0 ? 1 : 0;
	process.exit(exitCode);
}

// Default: just output the tree format if no output option specified
if (!options.output && !options.check) {
	printUsageReport(usages);
}
