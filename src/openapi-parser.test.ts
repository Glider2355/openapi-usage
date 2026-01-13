import { describe, expect, it } from "vitest";
import { parseOpenAPISpec } from "./openapi-parser.js";
import type { OpenAPISpec } from "./types.js";

describe("parseOpenAPISpec", () => {
	it("OpenAPIスペックからエンドポイントを抽出する", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": {
					get: { summary: "Get users" },
					post: { summary: "Create user" },
				},
				"/users/{id}": {
					get: { summary: "Get user by ID" },
					delete: { summary: "Delete user" },
				},
			},
		};

		const endpoints = parseOpenAPISpec(spec);

		expect(endpoints.size).toBe(4);
		expect(endpoints.has("GET /users")).toBe(true);
		expect(endpoints.has("POST /users")).toBe(true);
		expect(endpoints.has("GET /users/{id}")).toBe(true);
		expect(endpoints.has("DELETE /users/{id}")).toBe(true);
	});

	it("空のpathsを処理できる", () => {
		const spec: OpenAPISpec = { paths: {} };
		const endpoints = parseOpenAPISpec(spec);
		expect(endpoints.size).toBe(0);
	});

	it("HTTPメソッド以外のプロパティを無視する", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": {
					get: { summary: "Get users" },
					parameters: [{ name: "id", in: "query" }],
				},
			},
		};

		const endpoints = parseOpenAPISpec(spec);

		expect(endpoints.size).toBe(1);
		expect(endpoints.has("GET /users")).toBe(true);
	});

	it("全てのHTTPメソッドを処理できる", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/resource": {
					get: {},
					post: {},
					put: {},
					delete: {},
					patch: {},
				},
			},
		};

		const endpoints = parseOpenAPISpec(spec);

		expect(endpoints.size).toBe(5);
		expect(endpoints.has("GET /resource")).toBe(true);
		expect(endpoints.has("POST /resource")).toBe(true);
		expect(endpoints.has("PUT /resource")).toBe(true);
		expect(endpoints.has("DELETE /resource")).toBe(true);
		expect(endpoints.has("PATCH /resource")).toBe(true);
	});

	it("メソッドを大文字に変換する", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": {
					Get: {},
					POST: {},
				},
			},
		};

		const endpoints = parseOpenAPISpec(spec);

		expect(endpoints.has("GET /users")).toBe(true);
		expect(endpoints.has("POST /users")).toBe(true);
	});
});
