import { relative, resolve } from "node:path";
import { type CallExpression, Node, Project, type SourceFile } from "ts-morph";
import { HTTP_METHODS, type HttpMethod, type Usage } from "./types.js";

/**
 * Extract string literals from an expression (handles variables, ternary, etc.)
 */
export function extractStringLiterals(node: Node): string[] {
	const results: string[] = [];

	// Direct string literal
	if (Node.isStringLiteral(node)) {
		results.push(node.getLiteralValue());
		return results;
	}

	// Template literal without substitutions
	if (Node.isNoSubstitutionTemplateLiteral(node)) {
		results.push(node.getLiteralValue());
		return results;
	}

	// Ternary/Conditional expression: condition ? "path1" : "path2"
	if (Node.isConditionalExpression(node)) {
		const whenTrue = node.getWhenTrue();
		const whenFalse = node.getWhenFalse();
		results.push(...extractStringLiterals(whenTrue));
		results.push(...extractStringLiterals(whenFalse));
		return results;
	}

	// Identifier (variable reference) - trace back to definition
	if (Node.isIdentifier(node)) {
		const definitions = node.getDefinitionNodes();
		for (const def of definitions) {
			// VariableDeclaration: const endpoint = "..."
			if (Node.isVariableDeclaration(def)) {
				const initializer = def.getInitializer();
				if (initializer) {
					results.push(...extractStringLiterals(initializer));
				}
			}
			// Parameter with default value
			if (Node.isParameterDeclaration(def)) {
				const initializer = def.getInitializer();
				if (initializer) {
					results.push(...extractStringLiterals(initializer));
				}
			}
		}
		return results;
	}

	// Parenthesized expression: (expression)
	if (Node.isParenthesizedExpression(node)) {
		return extractStringLiterals(node.getExpression());
	}

	// As expression (type assertion): expr as Type
	if (Node.isAsExpression(node)) {
		return extractStringLiterals(node.getExpression());
	}

	return results;
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
		// e.g., /users/{id} -> /users/[^/]+
		const regexPattern = endpointPath.replace(/\{[^}]+\}/g, "[^/]+");
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

	sourceFile.forEachDescendant((node) => {
		if (!Node.isCallExpression(node)) return;

		const callExpr = node as CallExpression;
		const expression = callExpr.getExpression();

		// Check if it's a property access like client.GET or client.POST
		if (!Node.isPropertyAccessExpression(expression)) return;

		const methodName = expression.getName();
		const objectExpr = expression.getExpression();

		// Check if the object is "client" and method is an HTTP method
		if (
			!Node.isIdentifier(objectExpr) ||
			objectExpr.getText() !== "client" ||
			!HTTP_METHODS.includes(methodName as HttpMethod)
		) {
			return;
		}

		const args = callExpr.getArguments();
		if (args.length === 0) return;

		const firstArg = args[0];
		const line = sourceFile.getLineAndColumnAtPos(node.getStart()).line;

		// Extract all possible path values (handles variables, ternary, etc.)
		const pathValues = extractStringLiterals(firstArg);

		for (const pathValue of pathValues) {
			const key = `${methodName} ${pathValue}`;

			const usage = { file: relativeFilePath, line };
			const existingUsages = usages.get(key);

			if (existingUsages) {
				existingUsages.push(usage);
			} else {
				// Path might have different parameter format
				// Try to match with OpenAPI path patterns
				const matchedKey = findMatchingEndpoint(key, endpoints);
				if (matchedKey) {
					usages.get(matchedKey)?.push(usage);
				}
			}
		}
	});
}
