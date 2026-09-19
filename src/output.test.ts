import { describe, expect, it } from "vitest";
import {
	formatIgnoredEndpoints,
	formatLocationViolations,
	formatSourceSummary,
	formatSummary,
	formatTree,
	formatUnmatchedIgnoreWarnings,
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
			ignored: 0,
		});
	});

	it("メソッドとパスを正しく分割する", () => {
		const usages = new Map([["GET /users/{id}", []]]);

		const output = generateJsonOutput(usages);

		expect(output.endpoints[0].method).toBe("GET");
		expect(output.endpoints[0].path).toBe("/users/{id}");
	});
});

describe("formatSourceSummary", () => {
	const usages = new Map([
		["GET /users", [{ file: "packages/frontend/src/api.ts", line: 1 }]],
		["GET /admin", [{ file: "e2e/api/admin.spec.ts", line: 2 }]],
		["GET /posts", []],
	]);

	it("srcごとの未使用数を出力する（#57）", () => {
		const lines = formatSourceSummary(usages, [
			"packages/frontend/src",
			"e2e/api",
		]);

		expect(lines).toEqual([
			"Unused APIs per source:",
			"  packages/frontend/src: 2",
			"  e2e/api: 2",
		]);
	});

	it("srcがカレントディレクトリ自身でも集計できる", () => {
		const lines = formatSourceSummary(
			new Map([
				["GET /users", [{ file: "app.ts", line: 1 }]],
				["GET /admin", [{ file: "e2e/api/admin.spec.ts", line: 2 }]],
			]),
			["", "e2e/api"],
		);

		// srcがカレントディレクトリ自身なら配下の全ファイルが対象になる
		expect(lines).toEqual(["Unused APIs per source:", "  : 0", "  e2e/api: 1"]);
	});

	it("srcが1つなら出力しない", () => {
		expect(formatSourceSummary(usages, ["packages/frontend/src"])).toEqual([]);
	});
});

describe("formatIgnoredEndpoints", () => {
	it("理由付きでignore済みエンドポイントを出力する（#59）", () => {
		const ignored = new Map([
			["GET /temp/{id}", { pattern: "GET /temp/*", reason: "static files" }],
			["GET /health", { pattern: "GET /health" }],
		]);

		expect(formatIgnoredEndpoints(ignored)).toEqual([
			"Ignored APIs: 2",
			"  - GET /health",
			"  - GET /temp/{id} (static files)",
		]);
	});

	it("ignoreが無ければ空配列", () => {
		expect(formatIgnoredEndpoints(new Map())).toEqual([]);
	});
});

describe("formatUnmatchedIgnoreWarnings", () => {
	it("マッチしなかったパターンの警告を出力する（#56）", () => {
		expect(
			formatUnmatchedIgnoreWarnings([
				{ pattern: "GET /sounds/*" },
				{ pattern: "GET /characters/*", reason: "removed" },
			]),
		).toEqual([
			'warning: ignore pattern "GET /sounds/*" matched no endpoint',
			'warning: ignore pattern "GET /characters/*" matched no endpoint',
		]);
	});

	it("未マッチが無ければ空配列", () => {
		expect(formatUnmatchedIgnoreWarnings([])).toEqual([]);
	});
});

describe("formatLocationViolations", () => {
	it("違反を出力する（#58）", () => {
		const lines = formatLocationViolations([
			{
				endpoint: "GET /novel/{id}",
				file: "src/components/NovelCard.tsx",
				line: 4,
				pattern: "* /novel/**",
				allowed: ["src/hooks/api/novel/**"],
			},
		]);

		expect(lines).toEqual([
			"─".repeat(35),
			"Location violations: 1",
			"  - GET /novel/{id} at src/components/NovelCard.tsx:4",
			'    allowed: src/hooks/api/novel/** (rule: "* /novel/**")',
		]);
	});

	it("違反が無ければ空配列", () => {
		expect(formatLocationViolations([])).toEqual([]);
	});
});

describe("generateJsonOutput（ignore付き）", () => {
	it("ignore済みエンドポイントをignored/reason付きで含める（#59）", () => {
		const usages = new Map([["GET /users", [{ file: "src/a.ts", line: 1 }]]]);
		const ignored = new Map([
			["GET /health", { pattern: "GET /health", reason: "ヘルスチェック" }],
			["GET /metrics", { pattern: "* /metrics" }],
		]);

		const output = generateJsonOutput(usages, ignored);

		expect(output.endpoints).toEqual([
			{
				method: "GET",
				path: "/health",
				usages: [],
				ignored: true,
				reason: "ヘルスチェック",
			},
			{ method: "GET", path: "/metrics", usages: [], ignored: true },
			{
				method: "GET",
				path: "/users",
				usages: [{ file: "src/a.ts", line: 1 }],
			},
		]);
		expect(output.summary).toEqual({
			total: 3,
			used: 1,
			unused: 0,
			ignored: 2,
		});
	});
});
