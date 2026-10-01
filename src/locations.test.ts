import { describe, expect, it } from "vitest";
import {
	findLocationRule,
	findLocationViolations,
	matchPathGlob,
} from "./locations.js";

describe("matchPathGlob", () => {
	it("**はディレクトリ境界を越えてマッチする", () => {
		expect(matchPathGlob("src/hooks/api/useX.ts", "src/hooks/api/**")).toBe(
			true,
		);
		expect(
			matchPathGlob("src/hooks/api/novel/useNovel.ts", "src/hooks/api/**"),
		).toBe(true);
		expect(matchPathGlob("src/components/Novel.tsx", "src/hooks/api/**")).toBe(
			false,
		);
	});

	it("*はディレクトリ境界を越えない", () => {
		expect(matchPathGlob("src/api/users.ts", "src/api/*.ts")).toBe(true);
		expect(matchPathGlob("src/api/users/index.ts", "src/api/*.ts")).toBe(false);
	});

	it("中間の**は任意の深さにマッチする", () => {
		expect(
			matchPathGlob("src/app/novel/_lib/fetch.ts", "src/app/**/_lib/**"),
		).toBe(true);
		expect(matchPathGlob("src/app/_lib/fetch.ts", "src/app/**/_lib/**")).toBe(
			true,
		);
		expect(matchPathGlob("src/app/novel/page.tsx", "src/app/**/_lib/**")).toBe(
			false,
		);
	});

	it("./ 始まりと Windows 区切りを正規化する", () => {
		expect(matchPathGlob("src/api/x.ts", "./src/api/**")).toBe(true);
		expect(matchPathGlob("src\\api\\x.ts", "src/api/**")).toBe(true);
	});

	it("ドットなどの正規表現メタ文字をリテラル扱いする", () => {
		expect(matchPathGlob("srcXapi/x.ts", "src.api/**")).toBe(false);
	});

	it("ワイルドカードなしのglobはディレクトリとして配下にマッチする", () => {
		expect(matchPathGlob("src/hooks/api/x.ts", "src/hooks/api")).toBe(true);
		expect(matchPathGlob("src/hooks/api/user/x.ts", "src/hooks/api/")).toBe(
			true,
		);
		expect(matchPathGlob("src/hooks/api/x.ts", "./src/hooks/api/")).toBe(true);
		expect(matchPathGlob("src/hooks/apix/x.ts", "src/hooks/api")).toBe(false);
	});

	it("ワイルドカードなしのglobはファイルの完全一致にもマッチする", () => {
		expect(matchPathGlob("src/api.ts", "src/api.ts")).toBe(true);
		expect(matchPathGlob("src/api.tsx", "src/api.ts")).toBe(false);
	});
});

describe("findLocationRule", () => {
	const locations = {
		"* /novel/**": ["src/hooks/api/novel/**"],
		"* /user/**": ["src/hooks/api/user/**"],
		"*": ["src/hooks/api/**"],
	};

	it("より具体的なパターンが優先される", () => {
		expect(findLocationRule("GET /novel/{id}", locations)).toEqual({
			pattern: "* /novel/**",
			allowed: ["src/hooks/api/novel/**"],
		});
	});

	it("マッチするものがなければ既定の * が使われる", () => {
		expect(findLocationRule("GET /posts", locations)).toEqual({
			pattern: "*",
			allowed: ["src/hooks/api/**"],
		});
	});

	it("locationsが空ならnull", () => {
		expect(findLocationRule("GET /posts", {})).toBeNull();
	});
});

describe("findLocationViolations", () => {
	const locations = {
		"* /novel/**": ["src/hooks/api/novel/**", "src/app/**/_lib/**"],
		"*": ["src/hooks/api/**"],
	};

	it("許可ディレクトリ外の呼び出しを違反として報告する", () => {
		const usages = new Map([
			[
				"GET /novel/{id}",
				[
					{ file: "src/hooks/api/novel/useNovel.ts", line: 10 },
					{ file: "src/components/NovelCard.tsx", line: 4 },
				],
			],
		]);

		const violations = findLocationViolations(usages, locations);

		expect(violations).toEqual([
			{
				endpoint: "GET /novel/{id}",
				file: "src/components/NovelCard.tsx",
				line: 4,
				pattern: "* /novel/**",
				allowed: ["src/hooks/api/novel/**", "src/app/**/_lib/**"],
			},
		]);
	});

	it("許可ディレクトリ内なら違反なし", () => {
		const usages = new Map([
			["GET /novel/{id}", [{ file: "src/app/novel/_lib/fetch.ts", line: 3 }]],
			["GET /posts", [{ file: "src/hooks/api/usePosts.ts", line: 3 }]],
		]);

		expect(findLocationViolations(usages, locations)).toEqual([]);
	});

	it("未使用エンドポイントは違反にならない", () => {
		const usages = new Map([["GET /novel/{id}", []]]);

		expect(findLocationViolations(usages, locations)).toEqual([]);
	});

	it("locationsが空なら常に違反なし", () => {
		const usages = new Map([
			["GET /novel/{id}", [{ file: "anywhere/x.ts", line: 1 }]],
		]);

		expect(findLocationViolations(usages, {})).toEqual([]);
	});
});
