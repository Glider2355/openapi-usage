// ライブラリエクスポート

// Analyzer
export {
	type AnalyzeOptions,
	analyzeSourceFile,
	analyzeTypeScriptFiles,
	extractStringLiterals,
	findMatchingEndpoint,
	findOpenApiFetchClients,
} from "./analyzer.js";

// CLI
export { type CliOptions, createProgram, parseArgs } from "./cli.js";
// OpenAPI Parser
export {
	type LoadResult,
	loadOpenAPISpec,
	parseOpenAPISpec,
} from "./openapi-parser.js";
// Output
export {
	formatSummary,
	formatTree,
	generateJsonOutput,
	getUnusedEndpoints,
} from "./output.js";
// Runner
export { type RunResult, run } from "./runner.js";

// Types
export type {
	ApiDependencies,
	Endpoint,
	HttpMethod,
	OpenAPIOperation,
	OpenAPIPathItem,
	OpenAPISpec,
	Usage,
} from "./types.js";

export { HTTP_METHODS } from "./types.js";
