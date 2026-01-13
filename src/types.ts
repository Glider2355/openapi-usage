export interface OpenAPISpec {
	paths: Record<string, Record<string, unknown>>;
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
