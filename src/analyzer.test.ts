import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	analyzeSourceFile,
	extractStringLiterals,
	findMatchingEndpoint,
} from "./analyzer.js";

describe("extractStringLiterals", () => {
	const project = new Project({ useInMemoryFileSystem: true });

	it("文字列リテラルを抽出できる", () => {
		const source = project.createSourceFile("test1.ts", 'const x = "/users";', {
			overwrite: true,
		});
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("変数なしのテンプレートリテラルを抽出できる", () => {
		const source = project.createSourceFile("test2.ts", "const x = `/users`;", {
			overwrite: true,
		});
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("三項演算子から両方の値を抽出できる", () => {
		const source = project.createSourceFile(
			"test3.ts",
			'const x = true ? "/a" : "/b";',
			{ overwrite: true },
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/a", "/b"]);
	});

	it("括弧で囲まれた式から抽出できる", () => {
		const source = project.createSourceFile(
			"test4.ts",
			'const x = ("/users");',
			{ overwrite: true },
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("as式から抽出できる", () => {
		const source = project.createSourceFile(
			"test5.ts",
			'const x = "/users" as const;',
			{ overwrite: true },
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users"]);
	});

	it("複雑な式の場合は空配列を返す", () => {
		const source = project.createSourceFile(
			"test6.ts",
			"const x = getPath();",
			{ overwrite: true },
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual([]);
	});
});

describe("findMatchingEndpoint", () => {
	it("完全一致するエンドポイントを見つける", () => {
		const endpoints = new Map([
			["GET /users", new Set<string>()],
			["POST /users", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users", endpoints)).toBe("GET /users");
		expect(findMatchingEndpoint("POST /users", endpoints)).toBe("POST /users");
	});

	it("パスパラメータを含むエンドポイントにマッチする", () => {
		const endpoints = new Map([
			["GET /users/{id}", new Set<string>()],
			["DELETE /users/{id}/posts/{postId}", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users/123", endpoints)).toBe(
			"GET /users/{id}",
		);
		expect(findMatchingEndpoint("DELETE /users/123/posts/456", endpoints)).toBe(
			"DELETE /users/{id}/posts/{postId}",
		);
	});

	it("メソッドが一致しない場合はnullを返す", () => {
		const endpoints = new Map([["GET /users", new Set<string>()]]);

		expect(findMatchingEndpoint("POST /users", endpoints)).toBe(null);
	});

	it("パスが一致しない場合はnullを返す", () => {
		const endpoints = new Map([["GET /users", new Set<string>()]]);

		expect(findMatchingEndpoint("GET /posts", endpoints)).toBe(null);
	});
});

describe("analyzeSourceFile", () => {
	const project = new Project({ useInMemoryFileSystem: true });

	it("client.GET呼び出しを検出する", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const client = createClient();
client.GET("/users");
client.POST("/users");
`,
			{ overwrite: true },
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

	it("パスパラメータを含むパスにマッチする", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const client = createClient();
client.GET("/users/123");
`,
			{ overwrite: true },
		);

		const endpoints = new Map([["GET /users/{id}", new Set<string>()]]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /users/{id}", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /users/{id}")).toHaveLength(1);
	});

	it("openapi-fetch以外の呼び出しは無視する", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const axios = createAxiosClient();
axios.GET("/users");
`,
			{ overwrite: true },
		);

		const endpoints = new Map([["GET /users", new Set<string>()]]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /users", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /users")).toHaveLength(0);
	});

	it("カスタム名のcreateClient変数を検出する", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
import { createClient } from "openapi-fetch";
const api = createClient();
api.GET("/users");
`,
			{ overwrite: true },
		);

		const endpoints = new Map([["GET /users", new Set<string>()]]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /users", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /users")).toHaveLength(1);
	});
});
