import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isIgnored, loadConfig, normalizeIgnoreRules } from "./config.js";

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

	it("levelが不正な値の場合はエラー（#54）", () => {
		const configPath = `${testDir}/invalid-level.yaml`;
		writeFileSync(configPath, "level: warning\n");

		const result = loadConfig(configPath);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain('invalid level "warning"');
			expect(result.error).toContain('expected "error" or "warn"');
		}
	});

	it("未知のキーは警告して無視する（#54）", () => {
		const configPath = `${testDir}/unknown-key.yaml`;
		writeFileSync(configPath, "src: ./src\nlevell: error\n");

		const result = loadConfig(configPath);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('unknown config key "levell"');
			expect(result.config).not.toHaveProperty("levell");
		}
	});

	it("型が合わない値はエラー", () => {
		const configPath = `${testDir}/invalid-type.yaml`;
		writeFileSync(configPath, "ignore: 'GET /health'\n");

		const result = loadConfig(configPath);

		expect(result.success).toBe(false);
	});

	it("srcを配列で指定できる（#57）", () => {
		const configPath = `${testDir}/multi-src.yaml`;
		writeFileSync(
			configPath,
			`
src:
  - packages/frontend/src
  - e2e/api
`,
		);

		const result = loadConfig(configPath);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.config.src).toEqual(["packages/frontend/src", "e2e/api"]);
		}
	});

	it("ignoreに理由付きobjectを指定できる（#59）", () => {
		const configPath = `${testDir}/structured-ignore.yaml`;
		writeFileSync(
			configPath,
			`
ignore:
  - "GET /health"
  - pattern: "GET /temp/*"
    reason: "ローカル用静的ファイル配信"
`,
		);

		const result = loadConfig(configPath);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.config.ignore).toEqual([
				"GET /health",
				{ pattern: "GET /temp/*", reason: "ローカル用静的ファイル配信" },
			]);
		}
	});

	it("locationsを指定できる（#58）", () => {
		const configPath = `${testDir}/locations.yaml`;
		writeFileSync(
			configPath,
			`
locations:
  "* /novel/**":
    - "src/hooks/api/novel/**"
  "*":
    - "src/hooks/api/**"
`,
		);

		const result = loadConfig(configPath);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.config.locations).toEqual({
				"* /novel/**": ["src/hooks/api/novel/**"],
				"*": ["src/hooks/api/**"],
			});
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

	it("理由付きobjectエントリでもマッチする（#59）", () => {
		const patterns = [{ pattern: "GET /temp/*", reason: "static files" }];

		expect(isIgnored("GET /temp/file.png", patterns)).toBe(true);
		expect(isIgnored("GET /users", patterns)).toBe(false);
	});
});

describe("normalizeIgnoreRules", () => {
	it("文字列とobjectの混在を正規化する（#59）", () => {
		const rules = normalizeIgnoreRules([
			"GET /health",
			{ pattern: "GET /temp/*", reason: "static files" },
		]);

		expect(rules).toEqual([
			{ pattern: "GET /health" },
			{ pattern: "GET /temp/*", reason: "static files" },
		]);
	});
});
