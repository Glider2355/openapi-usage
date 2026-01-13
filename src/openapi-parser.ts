import type { OpenAPISpec } from "./types.js";
import { HTTP_METHODS, type HttpMethod } from "./types.js";

/**
 * Parse OpenAPI spec JSON and extract all endpoints
 */
export function parseOpenAPISpec(spec: OpenAPISpec): Map<string, Set<string>> {
	const endpoints = new Map<string, Set<string>>();

	for (const [path, methods] of Object.entries(spec.paths)) {
		for (const method of Object.keys(methods)) {
			const upperMethod = method.toUpperCase();
			if (HTTP_METHODS.includes(upperMethod as HttpMethod)) {
				const key = `${upperMethod} ${path}`;
				if (!endpoints.has(key)) {
					endpoints.set(key, new Set());
				}
			}
		}
	}

	return endpoints;
}
