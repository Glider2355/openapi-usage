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
export {
	type CliOptions,
	createProgram,
	parseArgs,
	type SeverityLevel,
} from "./cli.js";
// Config
export {
	type Config,
	type IgnoreEntry,
	type IgnoreRule,
	isIgnored,
	loadConfig,
	matchEndpointPattern,
	normalizeIgnoreRules,
	severityLevelSchema,
} from "./config.js";
// Locations
export {
	findLocationRule,
	findLocationViolations,
	type LocationRule,
	type LocationViolation,
	matchPathGlob,
} from "./locations.js";
// OpenAPI Parser
export {
	type LoadResult,
	loadOpenAPISpec,
	parseOpenAPISpec,
} from "./openapi-parser.js";
// Output
export {
	formatIgnoredEndpoints,
	formatLocationViolations,
	formatSourceSummary,
	formatSummary,
	formatTree,
	formatUnmatchedIgnoreWarnings,
	generateJsonOutput,
	getUnusedEndpoints,
} from "./output.js";
// Runner
export { applyIgnoreRules, type RunResult, run } from "./runner.js";

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
