import { readFileSync } from "node:fs";
import { HTTP_METHODS, type HttpMethod, type OpenAPISpec } from "./types.js";

export type LoadResult =
	| { success: true; spec: OpenAPISpec }
	| { success: false; error: string };

/**
 * OpenAPI仕様ファイルを読み込んでパースする
 * @param filePath - OpenAPI JSONファイルのパス
 * @returns 成功時はspec、失敗時はエラーメッセージを含むResult型
 */
export function loadOpenAPISpec(filePath: string): LoadResult {
	try {
		const content = readFileSync(filePath, "utf-8");
		const spec = JSON.parse(content) as OpenAPISpec;
		return { success: true, spec };
	} catch (error) {
		if (error instanceof SyntaxError) {
			return {
				success: false,
				error: `Invalid JSON in OpenAPI spec: ${error.message}`,
			};
		}
		const message = error instanceof Error ? error.message : String(error);
		return { success: false, error: `Failed to read OpenAPI spec: ${message}` };
	}
}

/**
 * OpenAPI仕様からエンドポイント一覧を抽出する
 * @param spec - パース済みのOpenAPI仕様オブジェクト
 * @returns エンドポイントキー（"GET /users"形式）のMap
 */
export function parseOpenAPISpec(spec: OpenAPISpec): Map<string, Set<string>> {
	const endpoints = new Map<string, Set<string>>();

	for (const [path, methods] of Object.entries(spec.paths)) {
		for (const method of Object.keys(methods)) {
			const upperMethod = method.toUpperCase();
			if (HTTP_METHODS.includes(upperMethod as HttpMethod)) {
				const key = `${upperMethod} ${path}`;
				endpoints.set(key, new Set());
			}
		}
	}

	return endpoints;
}
