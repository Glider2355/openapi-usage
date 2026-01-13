import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { extractStringLiterals } from "./extractors.js";

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

	it("テンプレート式をOpenAPIパスパターンに変換できる", () => {
		const source = project.createSourceFile(
			"test-template.ts",
			"const id = 123; const x = `/users/${id}`;",
			{ overwrite: true },
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual(["/users/{id}"]);
	});

	it("複数のテンプレート式を変換できる", () => {
		const source = project.createSourceFile(
			"test-multi-template.ts",
			"const userId = 1; const postId = 2; const x = `/users/${userId}/posts/${postId}`;",
			{ overwrite: true },
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual([
			"/users/{userId}/posts/{postId}",
		]);
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
			{
				overwrite: true,
			},
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

	it("変数参照から値を抽出できる", () => {
		const source = project.createSourceFile(
			"test-var.ts",
			'const path = "/users"; const x = path;',
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
			{
				overwrite: true,
			},
		);
		const varDecl = source.getVariableDeclarationOrThrow("x");
		const init = varDecl.getInitializerOrThrow();
		expect(extractStringLiterals(init)).toEqual([]);
	});
});
