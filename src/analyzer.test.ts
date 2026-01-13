import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { analyzeSourceFile, findOpenApiFetchClients } from "./analyzer.js";

describe("findOpenApiFetchClients", () => {
	const project = new Project({ useInMemoryFileSystem: true });

	it("openapi-fetchからインポートされたcreateClientを検出する", () => {
		const source = project.createSourceFile(
			"test-client.ts",
			`
import { createClient } from "openapi-fetch";
const api = createClient();
`,
			{ overwrite: true },
		);

		const clients = findOpenApiFetchClients(source);
		expect(clients.has("api")).toBe(true);
	});

	it("openapi-fetchがインポートされていない場合はclientをデフォルトとする", () => {
		const source = project.createSourceFile(
			"test-no-import.ts",
			`
const api = createClient();
`,
			{ overwrite: true },
		);

		const clients = findOpenApiFetchClients(source);
		expect(clients.has("client")).toBe(true);
	});

	it("複数のcreateClient呼び出しを検出する", () => {
		const source = project.createSourceFile(
			"test-multi-client.ts",
			`
import { createClient } from "openapi-fetch";
const api1 = createClient();
const api2 = createClient();
`,
			{ overwrite: true },
		);

		const clients = findOpenApiFetchClients(source);
		expect(clients.has("api1")).toBe(true);
		expect(clients.has("api2")).toBe(true);
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

	it("テンプレートリテラルのパスを検出する", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const client = createClient();
const id = 123;
client.GET(\`/users/\${id}\`);
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

	it("三項演算子の両方のパスを検出する", () => {
		const source = project.createSourceFile(
			"/src/test.ts",
			`
const client = createClient();
const isAdmin = true;
client.GET(isAdmin ? "/admin/users" : "/users");
`,
			{ overwrite: true },
		);

		const endpoints = new Map([
			["GET /admin/users", new Set<string>()],
			["GET /users", new Set<string>()],
		]);
		const usages = new Map<string, { file: string; line: number }[]>([
			["GET /admin/users", []],
			["GET /users", []],
		]);

		analyzeSourceFile(source, "/src", endpoints, usages);

		expect(usages.get("GET /admin/users")).toHaveLength(1);
		expect(usages.get("GET /users")).toHaveLength(1);
	});
});
