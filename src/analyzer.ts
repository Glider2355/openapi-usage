import { relative, resolve } from "node:path";
import { type CallExpression, Node, Project, type SourceFile } from "ts-morph";
import { HTTP_METHODS, type HttpMethod, type Usage } from "./types.js";

function extractFromStringLiteral(node: Node): string[] | null {
	if (!Node.isStringLiteral(node)) return null;
	return [node.getLiteralValue()];
}

function extractFromTemplateLiteral(node: Node): string[] | null {
	if (!Node.isNoSubstitutionTemplateLiteral(node)) return null;
	return [node.getLiteralValue()];
}

function extractFromTemplateExpression(node: Node): string[] | null {
	if (!Node.isTemplateExpression(node)) return null;
	// Convert template expression to OpenAPI path pattern
	// e.g., `/users/${id}` -> `/users/{id}`
	const head = node.getHead().getText().slice(1, -2); // Remove ` and ${
	const spans = node.getTemplateSpans();

	let pattern = head;
	for (const span of spans) {
		const expr = span.getExpression();
		const varName = Node.isIdentifier(expr) ? expr.getText() : "param";
		pattern += `{${varName}}`;
		const literal = span.getLiteral();
		const literalText = literal.getText();
		// Remove }` or }${ from the literal text
		const cleanText = literalText.startsWith("}")
			? literalText.slice(1, literalText.endsWith("`") ? -1 : -2)
			: literalText;
		pattern += cleanText;
	}

	return [pattern];
}

function extractFromConditionalExpression(node: Node): string[] | null {
	if (!Node.isConditionalExpression(node)) return null;
	return [
		...extractStringLiterals(node.getWhenTrue()),
		...extractStringLiterals(node.getWhenFalse()),
	];
}

function extractFromIdentifier(node: Node): string[] | null {
	if (!Node.isIdentifier(node)) return null;
	const results: string[] = [];
	for (const def of node.getDefinitionNodes()) {
		if (Node.isVariableDeclaration(def) || Node.isParameterDeclaration(def)) {
			const initializer = def.getInitializer();
			if (initializer) {
				results.push(...extractStringLiterals(initializer));
			}
		}
	}
	return results;
}

function extractFromParenthesizedExpression(node: Node): string[] | null {
	if (!Node.isParenthesizedExpression(node)) return null;
	return extractStringLiterals(node.getExpression());
}

function extractFromAsExpression(node: Node): string[] | null {
	if (!Node.isAsExpression(node)) return null;
	return extractStringLiterals(node.getExpression());
}

const stringLiteralExtractors = [
	extractFromStringLiteral,
	extractFromTemplateLiteral,
	extractFromTemplateExpression,
	extractFromConditionalExpression,
	extractFromIdentifier,
	extractFromParenthesizedExpression,
	extractFromAsExpression,
];

/**
 * Extract string literals from an expression (handles variables, ternary, etc.)
 */
export function extractStringLiterals(node: Node): string[] {
	for (const extractor of stringLiteralExtractors) {
		const result = extractor(node);
		if (result !== null) {
			return result;
		}
	}
	return [];
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find matching endpoint with path parameter patterns
 */
export function findMatchingEndpoint(
	key: string,
	endpoints: Map<string, Set<string>>,
): string | null {
	const [method, path] = key.split(" ", 2);

	for (const endpointKey of endpoints.keys()) {
		const [endpointMethod, endpointPath] = endpointKey.split(" ", 2);

		if (method !== endpointMethod) continue;

		// Convert OpenAPI path pattern to regex
		// First escape special chars, then replace path params
		// e.g., /api/v1.0/users/{id} -> /api/v1\.0/users/[^/]+
		const escapedPath = escapeRegex(endpointPath);
		const regexPattern = escapedPath.replace(/\\\{[^}]+\\\}/g, "[^/]+");
		const regex = new RegExp(`^${regexPattern}$`);

		if (regex.test(path)) {
			return endpointKey;
		}
	}

	return null;
}

export interface AnalyzeOptions {
	srcPath: string;
	tsConfigPath?: string;
}

/**
 * Analyze TypeScript files to find API calls
 */
export function analyzeTypeScriptFiles(
	endpoints: Map<string, Set<string>>,
	options: AnalyzeOptions,
): Map<string, Usage[]> {
	const { srcPath, tsConfigPath } = options;

	const projectOptions: ConstructorParameters<typeof Project>[0] = {
		skipAddingFilesFromTsConfig: true,
	};

	if (tsConfigPath) {
		projectOptions.tsConfigFilePath = tsConfigPath;
	}

	const project = new Project(projectOptions);

	// Add all TypeScript files
	project.addSourceFilesAtPaths([`${srcPath}/**/*.ts`, `${srcPath}/**/*.tsx`]);

	const usages = new Map<string, Usage[]>();

	// Initialize usages map with all endpoints
	for (const key of endpoints.keys()) {
		usages.set(key, []);
	}

	for (const sourceFile of project.getSourceFiles()) {
		analyzeSourceFile(sourceFile, srcPath, endpoints, usages);
	}

	return usages;
}

/**
 * Check if createClient is imported from openapi-fetch
 */
function isOpenApiFetchImported(sourceFile: SourceFile): boolean {
	for (const importDecl of sourceFile.getImportDeclarations()) {
		const moduleSpecifier = importDecl.getModuleSpecifierValue();
		if (moduleSpecifier === "openapi-fetch") {
			const namedImports = importDecl.getNamedImports();
			for (const namedImport of namedImports) {
				if (namedImport.getName() === "createClient") {
					return true;
				}
			}
			// Also check default import
			const defaultImport = importDecl.getDefaultImport();
			if (defaultImport?.getText() === "createClient") {
				return true;
			}
		}
	}
	return false;
}

/**
 * Find variable names that are assigned from createClient()
 * e.g., const api = createClient<paths>() -> returns ["api"]
 */
export function findOpenApiFetchClients(sourceFile: SourceFile): Set<string> {
	const clientNames = new Set<string>();

	// Only look for createClient if it's imported from openapi-fetch
	if (!isOpenApiFetchImported(sourceFile)) {
		// Fallback: use "client" as default for backwards compatibility
		clientNames.add("client");
		return clientNames;
	}

	sourceFile.forEachDescendant((node) => {
		if (!Node.isVariableDeclaration(node)) return;

		const initializer = node.getInitializer();
		if (!initializer || !Node.isCallExpression(initializer)) return;

		const callExpr = initializer.getExpression();

		// Check for createClient() or createClient<T>()
		if (Node.isIdentifier(callExpr) && callExpr.getText() === "createClient") {
			clientNames.add(node.getName());
		}
	});

	// Fallback: if no createClient call found but import exists
	if (clientNames.size === 0) {
		clientNames.add("client");
	}

	return clientNames;
}

interface ApiCallInfo {
	methodName: string;
	pathArg: Node;
	line: number;
}

/**
 * Try to extract API call info from a CallExpression node
 */
function tryExtractApiCall(
	node: Node,
	sourceFile: SourceFile,
	clientNames: Set<string>,
): ApiCallInfo | null {
	if (!Node.isCallExpression(node)) return null;

	const callExpr = node as CallExpression;
	const expression = callExpr.getExpression();

	if (!Node.isPropertyAccessExpression(expression)) return null;

	const methodName = expression.getName();
	const objectExpr = expression.getExpression();

	if (
		!Node.isIdentifier(objectExpr) ||
		!clientNames.has(objectExpr.getText()) ||
		!HTTP_METHODS.includes(methodName as HttpMethod)
	) {
		return null;
	}

	const args = callExpr.getArguments();
	if (args.length === 0) return null;

	return {
		methodName,
		pathArg: args[0],
		line: sourceFile.getLineAndColumnAtPos(node.getStart()).line,
	};
}

/**
 * Record API usage to the usages map
 */
function recordUsage(
	key: string,
	usage: Usage,
	usages: Map<string, Usage[]>,
	endpoints: Map<string, Set<string>>,
): void {
	const existingUsages = usages.get(key);

	if (existingUsages) {
		existingUsages.push(usage);
	} else {
		const matchedKey = findMatchingEndpoint(key, endpoints);
		if (matchedKey) {
			usages.get(matchedKey)?.push(usage);
		}
	}
}

/**
 * Analyze a single source file for API calls
 */
export function analyzeSourceFile(
	sourceFile: SourceFile,
	srcPath: string,
	endpoints: Map<string, Set<string>>,
	usages: Map<string, Usage[]>,
): void {
	const filePath = sourceFile.getFilePath();
	const relativeFilePath = relative(resolve(srcPath, ".."), filePath);
	const clientNames = findOpenApiFetchClients(sourceFile);

	sourceFile.forEachDescendant((node) => {
		const apiCall = tryExtractApiCall(node, sourceFile, clientNames);
		if (!apiCall) return;

		const pathValues = extractStringLiterals(apiCall.pathArg);
		const usage = { file: relativeFilePath, line: apiCall.line };

		for (const pathValue of pathValues) {
			const key = `${apiCall.methodName} ${pathValue}`;
			recordUsage(key, usage, usages, endpoints);
		}
	});
}
