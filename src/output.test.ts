import { describe, expect, it } from "vitest";
import {
	formatSummary,
	formatTree,
	generateJsonOutput,
	getUnusedEndpoints,
} from "./output.js";

describe("formatTree", () => {
	it("should format usages as tree", () => {
		const usages = new Map([
			["GET /users", [{ file: "src/pages/Users.tsx", line: 42 }]],
			["POST /users", []],
		]);

		const lines = formatTree(usages);

		expect(lines).toContain("GET /users");
		expect(lines).toContain("└─ src/pages/Users.tsx:42");
		expect(lines).toContain("POST /users");
		expect(lines).toContain("└─ (未使用)");
	});

	it("should show multiple usages with correct prefixes", () => {
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

	it("should sort keys alphabetically", () => {
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
	it("should return unused endpoints", () => {
		const usages = new Map([
			["GET /users", [{ file: "src/a.ts", line: 1 }]],
			["POST /users", []],
			["DELETE /users", []],
		]);

		const unused = getUnusedEndpoints(usages);

		expect(unused).toEqual(["POST /users", "DELETE /users"]);
	});

	it("should return empty array when all used", () => {
		const usages = new Map([["GET /users", [{ file: "src/a.ts", line: 1 }]]]);

		const unused = getUnusedEndpoints(usages);

		expect(unused).toEqual([]);
	});
});

describe("formatSummary", () => {
	it("should show 0 when no unused", () => {
		const usages = new Map([["GET /users", [{ file: "src/a.ts", line: 1 }]]]);

		const lines = formatSummary(usages);

		expect(lines).toContain("未使用 API: 0件");
	});

	it("should list unused endpoints", () => {
		const usages = new Map([
			["GET /users", []],
			["POST /users", []],
		]);

		const lines = formatSummary(usages);

		expect(lines).toContain("未使用 API: 2件");
		expect(lines).toContain("  - GET /users");
		expect(lines).toContain("  - POST /users");
	});
});

describe("generateJsonOutput", () => {
	it("should generate correct JSON structure", () => {
		const usages = new Map([
			["GET /users", [{ file: "src/a.ts", line: 1 }]],
			["POST /users", []],
		]);
		const date = new Date("2024-01-01T00:00:00Z");

		const output = generateJsonOutput(usages, date);

		expect(output.generated_at).toBe("2024-01-01T00:00:00.000Z");
		expect(output.endpoints).toHaveLength(2);
		expect(output.summary).toEqual({
			total: 2,
			used: 1,
			unused: 1,
		});
	});

	it("should split method and path correctly", () => {
		const usages = new Map([["GET /users/{id}", []]]);
		const date = new Date("2024-01-01T00:00:00Z");

		const output = generateJsonOutput(usages, date);

		expect(output.endpoints[0].method).toBe("GET");
		expect(output.endpoints[0].path).toBe("/users/{id}");
	});
});
