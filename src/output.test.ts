import { describe, expect, it } from "vitest";
import {
	formatSummary,
	formatTree,
	generateJsonOutput,
	getUnusedEndpoints,
} from "./output.js";

describe("formatTree", () => {
	it("使用状況をツリー形式でフォーマットする", () => {
		const usages = new Map([
			["GET /users", [{ file: "src/pages/Users.tsx", line: 42 }]],
			["POST /users", []],
		]);

		const lines = formatTree(usages);

		expect(lines).toContain("GET /users");
		expect(lines).toContain("└─ src/pages/Users.tsx:42");
		expect(lines).toContain("POST /users");
		expect(lines).toContain("└─ (unused)");
	});

	it("複数の使用箇所を正しいプレフィックスで表示する", () => {
		const usages = new Map([
			[
				"GET /users",
				[
					{ file: "src/a.ts", line: 1 },
					{ file: "src/b.ts", line: 2 },
				],
			],
		]);

		const lines = formatTree(usages);

		expect(lines).toContain("├─ src/a.ts:1");
		expect(lines).toContain("└─ src/b.ts:2");
	});

	it("キーをアルファベット順にソートする", () => {
		const usages = new Map([
			["POST /users", []],
			["GET /users", []],
			["DELETE /users", []],
		]);

		const lines = formatTree(usages);
		const keyLines = lines.filter(
			(l) =>
				l.startsWith("GET") || l.startsWith("POST") || l.startsWith("DELETE"),
		);

		expect(keyLines).toEqual(["DELETE /users", "GET /users", "POST /users"]);
	});
});

describe("getUnusedEndpoints", () => {
	it("未使用のエンドポイントを返す", () => {
		const usages = new Map([
			["GET /users", [{ file: "src/a.ts", line: 1 }]],
			["POST /users", []],
			["DELETE /users", []],
		]);

		const unused = getUnusedEndpoints(usages);

		expect(unused).toEqual(["POST /users", "DELETE /users"]);
	});

	it("全て使用済みの場合は空配列を返す", () => {
		const usages = new Map([["GET /users", [{ file: "src/a.ts", line: 1 }]]]);

		const unused = getUnusedEndpoints(usages);

		expect(unused).toEqual([]);
	});
});

describe("formatSummary", () => {
	it("未使用がない場合は0件と表示する", () => {
		const usages = new Map([["GET /users", [{ file: "src/a.ts", line: 1 }]]]);

		const lines = formatSummary(usages);

		expect(lines).toContain("Unused APIs: 0");
	});

	it("未使用のエンドポイントを一覧表示する", () => {
		const usages = new Map([
			["GET /users", []],
			["POST /users", []],
		]);

		const lines = formatSummary(usages);

		expect(lines).toContain("Unused APIs: 2");
		expect(lines).toContain("  - GET /users");
		expect(lines).toContain("  - POST /users");
	});
});

describe("generateJsonOutput", () => {
	it("正しいJSON構造を生成する", () => {
		const usages = new Map([
			["GET /users", [{ file: "src/a.ts", line: 1 }]],
			["POST /users", []],
		]);

		const output = generateJsonOutput(usages);

		expect(output.endpoints).toHaveLength(2);
		expect(output.summary).toEqual({
			total: 2,
			used: 1,
			unused: 1,
		});
	});

	it("メソッドとパスを正しく分割する", () => {
		const usages = new Map([["GET /users/{id}", []]]);

		const output = generateJsonOutput(usages);

		expect(output.endpoints[0].method).toBe("GET");
		expect(output.endpoints[0].path).toBe("/users/{id}");
	});
});
