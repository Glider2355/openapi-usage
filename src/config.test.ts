import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isIgnored, loadConfig } from "./config.js";

describe("loadConfig", () => {
	const testDir = ".config-test-fixtures";

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("指定されたファイルを読み込む", () => {
		const configPath = `${testDir}/custom-config.yaml`;
		writeFileSync(
			configPath,
			`
openapi: ./openapi.json
src: ./src
level: warn
ignore:
  - "GET /health"
`,
		);

		const result = loadConfig(configPath);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.config.openapi).toBe("./openapi.json");
			expect(result.config.src).toBe("./src");
			expect(result.config.level).toBe("warn");
			expect(result.config.ignore).toEqual(["GET /health"]);
		}
	});

	it("ファイルが見つからない場合はエラー", () => {
		const result = loadConfig(`${testDir}/not-found.yaml`);

		expect(result.success).toBe(false);
	});

	it("設定ファイルが指定されず、デフォルトファイルもない場合は空の設定を返す", () => {
		const cwd = process.cwd();
		process.chdir(testDir);

		try {
			const result = loadConfig();

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.config).toEqual({});
			}
		} finally {
			process.chdir(cwd);
		}
	});

	it("空のYAMLファイルでも動作する", () => {
		const configPath = `${testDir}/empty.yaml`;
		writeFileSync(configPath, "");

		const result = loadConfig(configPath);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.config).toEqual({});
		}
	});
});

describe("isIgnored", () => {
	it("完全一致でマッチする", () => {
		const patterns = ["GET /health", "POST /api/users"];

		expect(isIgnored("GET /health", patterns)).toBe(true);
		expect(isIgnored("POST /api/users", patterns)).toBe(true);
		expect(isIgnored("DELETE /health", patterns)).toBe(false);
	});

	it("ワイルドカードパターンでマッチする", () => {
		const patterns = ["* /internal/*", "GET /admin/*"];

		expect(isIgnored("GET /internal/webhook", patterns)).toBe(true);
		expect(isIgnored("POST /internal/status", patterns)).toBe(true);
		expect(isIgnored("GET /admin/users", patterns)).toBe(true);
		expect(isIgnored("POST /admin/users", patterns)).toBe(false);
		expect(isIgnored("GET /api/users", patterns)).toBe(false);
	});

	it("空のパターンリストではマッチしない", () => {
		expect(isIgnored("GET /health", [])).toBe(false);
	});
});
