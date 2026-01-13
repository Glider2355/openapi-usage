import { relative, resolve } from "node:path";
import { type CallExpression, Node, Project, type SourceFile } from "ts-morph";
import { extractStringLiterals } from "./extractors.js";
import { findMatchingEndpoint } from "./path-matcher.js";
import { HTTP_METHODS, type HttpMethod, type Usage } from "./types.js";

export { extractStringLiterals } from "./extractors.js";
export { findMatchingEndpoint } from "./path-matcher.js";

export interface AnalyzeOptions {
	srcPath: string;
	tsConfigPath?: string;
}

/**
 * TypeScriptファイル群を解析してAPI呼び出し箇所を検出する
 * @param endpoints - OpenAPIから抽出したエンドポイント一覧
 * @param options - 解析オプション（ソースパス、tsconfig等）
 * @returns エンドポイントごとの使用箇所マップ
 */
export function analyzeTypeScriptFiles(
	endpoints: Map<string, Set<string>>,
	options: AnalyzeOptions,
): Map<string, Usage[]> {
	const { srcPath, tsConfigPath } = options;
	const project = createProject(tsConfigPath);

	project.addSourceFilesAtPaths([`${srcPath}/**/*.ts`, `${srcPath}/**/*.tsx`]);

	const usages = initializeUsagesMap(endpoints);

	for (const sourceFile of project.getSourceFiles()) {
		analyzeSourceFile(sourceFile, srcPath, endpoints, usages);
	}

	return usages;
}

function createProject(tsConfigPath?: string): Project {
	const options: ConstructorParameters<typeof Project>[0] = {
		skipAddingFilesFromTsConfig: true,
	};

	if (tsConfigPath) {
		options.tsConfigFilePath = tsConfigPath;
	}

	return new Project(options);
}

function initializeUsagesMap(
	endpoints: Map<string, Set<string>>,
): Map<string, Usage[]> {
	const usages = new Map<string, Usage[]>();
	for (const key of endpoints.keys()) {
		usages.set(key, []);
	}
	return usages;
}

function isOpenApiFetchImported(sourceFile: SourceFile): boolean {
	for (const importDecl of sourceFile.getImportDeclarations()) {
		if (importDecl.getModuleSpecifierValue() !== "openapi-fetch") continue;

		const namedImports = importDecl.getNamedImports();
		for (const namedImport of namedImports) {
			if (namedImport.getName() === "createClient") {
				return true;
			}
		}

		const defaultImport = importDecl.getDefaultImport();
		if (defaultImport?.getText() === "createClient") {
			return true;
		}
	}
	return false;
}

/**
 * ソースファイルからopenapi-fetchのクライアント変数名を検出する
 * @param sourceFile - 解析対象のソースファイル
 * @returns クライアント変数名のSet（例: "client", "api"）
 */
export function findOpenApiFetchClients(sourceFile: SourceFile): Set<string> {
	const clientNames = new Set<string>();

	if (!isOpenApiFetchImported(sourceFile)) {
		clientNames.add("client");
		return clientNames;
	}

	sourceFile.forEachDescendant((node) => {
		if (!Node.isVariableDeclaration(node)) return;

		const initializer = node.getInitializer();
		if (!initializer || !Node.isCallExpression(initializer)) return;

		const callExpr = initializer.getExpression();
		if (Node.isIdentifier(callExpr) && callExpr.getText() === "createClient") {
			clientNames.add(node.getName());
		}
	});

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

	const isValidApiCall =
		Node.isIdentifier(objectExpr) &&
		clientNames.has(objectExpr.getText()) &&
		HTTP_METHODS.includes(methodName as HttpMethod);

	if (!isValidApiCall) return null;

	const args = callExpr.getArguments();
	if (args.length === 0) return null;

	return {
		methodName,
		pathArg: args[0],
		line: sourceFile.getLineAndColumnAtPos(node.getStart()).line,
	};
}

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
 * 単一のソースファイルを解析してAPI呼び出しを検出する
 * @param sourceFile - 解析対象のソースファイル
 * @param srcPath - ソースディレクトリのパス
 * @param endpoints - OpenAPIエンドポイント一覧
 * @param usages - 使用箇所を記録するマップ（副作用で更新）
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
