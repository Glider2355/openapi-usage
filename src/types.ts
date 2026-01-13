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
}

export interface ApiDependencies {
	generated_at: string;
	endpoints: Endpoint[];
	summary: {
		total: number;
		used: number;
		unused: number;
	};
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
