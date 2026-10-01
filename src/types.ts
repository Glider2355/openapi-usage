export interface OpenAPIOperation {
	summary?: string;
	description?: string;
	operationId?: string;
	parameters?: unknown[];
	requestBody?: unknown;
	responses?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface OpenAPIPathItem {
	get?: OpenAPIOperation;
	post?: OpenAPIOperation;
	put?: OpenAPIOperation;
	delete?: OpenAPIOperation;
	patch?: OpenAPIOperation;
	[key: string]: unknown;
}

export interface OpenAPISpec {
	paths: Record<string, OpenAPIPathItem>;
}

export interface Usage {
	file: string;
	line: number;
}

export interface Endpoint {
	method: string;
	path: string;
	usages: Usage[];
	/** ignore設定で除外されたエンドポイントの場合はtrue */
	ignored?: boolean;
	/** ignore理由（構造化ignoreでreasonが指定されている場合） */
	reason?: string;
}

export interface ApiDependencies {
	endpoints: Endpoint[];
	summary: {
		/** 全エンドポイント数（ignore分を含む） */
		total: number;
		/** 使用されているエンドポイント数 */
		used: number;
		/** 未使用エンドポイント数（ignore分を除く） */
		unused: number;
		/** ignore設定で除外されたエンドポイント数 */
		ignored: number;
	};
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
