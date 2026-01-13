import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeTypeScriptFiles } from "../src/analyzer.js";
import { parseOpenAPISpec } from "../src/openapi-parser.js";
import {
	formatSummary,
	formatTree,
	generateJsonOutput,
	getUnusedEndpoints,
} from "../src/output.js";
import type { OpenAPISpec } from "../src/types.js";

const TEST_DIR = join(import.meta.dirname, "../.test-fixtures");
const SRC_DIR = join(TEST_DIR, "src");

describe("Integration", () => {
	beforeEach(() => {
		mkdirSync(SRC_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("should detect used and unused APIs", () => {
		// Setup: OpenAPI spec
		const spec: OpenAPISpec = {
			paths: {
				"/users": {
					get: { summary: "List users" },
					post: { summary: "Create user" },
				},
				"/users/{id}": {
					get: { summary: "Get user" },
					delete: { summary: "Delete user" },
				},
				"/posts": {
					get: { summary: "List posts" },
				},
			},
		};

		// Setup: Source files
		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
import { createClient } from "openapi-fetch";

const client = createClient();

export async function getUsers() {
  return client.GET("/users");
}

export async function createUser(data: unknown) {
  return client.POST("/users");
}

export async function getUser(id: string) {
  return client.GET("/users/{id}");
}
`,
		);

		// Execute
		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		// Verify
		expect(usages.get("GET /users")).toHaveLength(1);
		expect(usages.get("POST /users")).toHaveLength(1);
		expect(usages.get("GET /users/{id}")).toHaveLength(1);
		expect(usages.get("DELETE /users/{id}")).toHaveLength(0);
		expect(usages.get("GET /posts")).toHaveLength(0);

		const unused = getUnusedEndpoints(usages);
		expect(unused).toEqual(["DELETE /users/{id}", "GET /posts"]);
	});

	it("should match dynamic path parameters", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users/{userId}/posts/{postId}": {
					get: { summary: "Get user post" },
				},
			},
		};

		writeFileSync(
			join(SRC_DIR, "posts.ts"),
			`
const client = { GET: () => {} };
client.GET("/users/123/posts/456");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users/{userId}/posts/{postId}")).toHaveLength(1);
	});

	it("should handle ternary expressions", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
				"/admins": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "conditional.ts"),
			`
const client = { GET: () => {} };
const isAdmin = true;
client.GET(isAdmin ? "/admins" : "/users");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users")).toHaveLength(1);
		expect(usages.get("GET /admins")).toHaveLength(1);
	});

	it("should handle multiple files", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
				"/posts": { get: {} },
				"/comments": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "users.ts"),
			`
const client = { GET: () => {} };
client.GET("/users");
`,
		);

		writeFileSync(
			join(SRC_DIR, "posts.ts"),
			`
const client = { GET: () => {} };
client.GET("/posts");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users")).toHaveLength(1);
		expect(usages.get("GET /posts")).toHaveLength(1);
		expect(usages.get("GET /comments")).toHaveLength(0);
	});

	it("should generate correct JSON output", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {}, post: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = { GET: () => {} };
client.GET("/users");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });
		const output = generateJsonOutput(usages, new Date("2024-01-01T00:00:00Z"));

		expect(output.summary).toEqual({
			total: 2,
			used: 1,
			unused: 1,
		});
		expect(output.endpoints).toHaveLength(2);
		expect(
			output.endpoints.find((e) => e.method === "GET")?.usages,
		).toHaveLength(1);
		expect(
			output.endpoints.find((e) => e.method === "POST")?.usages,
		).toHaveLength(0);
	});

	it("should format tree output correctly", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
				"/posts": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = { GET: () => {} };
client.GET("/users");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });
		const tree = formatTree(usages);
		const summary = formatSummary(usages);

		expect(tree.some((line) => line.includes("GET /users"))).toBe(true);
		expect(tree.some((line) => line.includes("api.ts"))).toBe(true);
		expect(tree.some((line) => line.includes("(未使用)"))).toBe(true);
		expect(summary.some((line) => line.includes("未使用 API: 1件"))).toBe(true);
	});

	it("should handle tsx files", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "Component.tsx"),
			`
const client = { GET: () => {} };

export function UserList() {
  client.GET("/users");
  return <div>Users</div>;
}
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users")).toHaveLength(1);
		expect(usages.get("GET /users")?.[0].file).toContain("Component.tsx");
	});

	it("should track line numbers correctly", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`const client = { GET: () => {} };
// line 2
// line 3
client.GET("/users"); // line 4
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users")?.[0].line).toBe(4);
	});

	it("should detect custom client names from createClient", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
				"/posts": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
import createClient from "openapi-fetch";

const api = createClient<paths>();
api.GET("/users");

const httpClient = createClient<paths>();
httpClient.GET("/posts");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users")).toHaveLength(1);
		expect(usages.get("GET /posts")).toHaveLength(1);
	});

	it("should ignore non-createClient objects", () => {
		const spec: OpenAPISpec = {
			paths: {
				"/users": { get: {} },
			},
		};

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const axios = createAxiosInstance();
axios.GET("/users");
`,
		);

		const endpoints = parseOpenAPISpec(spec);
		const usages = analyzeTypeScriptFiles(endpoints, { srcPath: SRC_DIR });

		expect(usages.get("GET /users")).toHaveLength(0);
	});
});
