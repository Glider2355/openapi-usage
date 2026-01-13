import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import {
	extractStringLiterals,
	findMatchingEndpoint,
	analyzeSourceFile,
} from "./analyzer.js";

describe("extractStringLiterals", () => {
	const project = new Project({ useInMemoryFileSystem: true });

	it("should extract string literal", () => {
		const source = project.createSourceFile(
			"test1.ts",
			'const x = "/users";',
			{ overwrite: true }
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("should extract template literal without substitutions", () => {
		const source = project.createSourceFile(
			"test2.ts",
			"const x = `/users`;",
			{ overwrite: true }
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("should extract from ternary expression", () => {
		const source = project.createSourceFile(
			"test3.ts",
			'const x = true ? "/a" : "/b";',
			{ overwrite: true }
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/a", "/b"]);
	});

	it("should extract from parenthesized expression", () => {
		const source = project.createSourceFile(
			"test4.ts",
			'const x = ("/users");',
			{ overwrite: true }
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("should extract from as expression", () => {
		const source = project.createSourceFile(
			"test5.ts",
			'const x = "/users" as const;',
			{ overwrite: true }
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("should return empty array for complex expressions", () => {
		const source = project.createSourceFile(
			"test6.ts",
			"const x = getPath();",
			{ overwrite: true }
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual([]);
	});
});

describe("findMatchingEndpoint", () => {
	it("should find exact match", () => {
		const endpoints = new Map([
			["GET /users", new Set<string>()],
			["POST /users", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users", endpoints)).toBe("GET /users");
		expect(findMatchingEndpoint("POST /users", endpoints)).toBe("POST /users");
	});

	it("should match path parameters", () => {
		const endpoints = new Map([
			["GET /users/{id}", new Set<string>()],
			["DELETE /users/{id}/posts/{postId}", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users/123", endpoints)).toBe(
			"GET /users/{id}"
		);
		expect(
			findMatchingEndpoint("DELETE /users/123/posts/456", endpoints)
		).toBe("DELETE /users/{id}/posts/{postId}");
	});

	it("should return null for non-matching method", () => {
		const endpoints = new Map([["GET /users", new Set<string>()]]);

		expect(findMatchingEndpoint("POST /users", endpoints)).toBe(null);
	});

	it("should return null for non-matching path", () => {
		const endpoints = new Map([["GET /users", new Set<string>()]]);

		expect(findMatchingEndpoint("GET /posts", endpoints)).toBe(null);
	});
});

describe("analyzeSourceFile", () => {
	const project = new Project({ useInMemoryFileSystem: true });

	it("should find client.GET calls", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const client = createClient();
client.GET("/users");
client.POST("/users");
`,
			{ overwrite: true }
		);

		const endpoints = new Map([
			["GET /users", new Set<string>()],
			["POST /users", new Set<string>()],
		]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /users", []],
			["POST /users", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /users")).toHaveLength(1);
		expect(usages.get("POST /users")).toHaveLength(1);
	});

	it("should match path parameters", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const client = createClient();
client.GET("/users/123");
`,
			{ overwrite: true }
		);

		const endpoints = new Map([["GET /users/{id}", new Set<string>()]]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /users/{id}", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /users/{id}")).toHaveLength(1);
	});

	it("should ignore non-client calls", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const api = createClient();
api.GET("/users");
`,
			{ overwrite: true }
		);

		const endpoints = new Map([["GET /users", new Set<string>()]]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /users", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /users")).toHaveLength(0);
	});
});
