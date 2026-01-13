import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "./runner.js";

describe("run", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "runner-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true });
		vi.restoreAllMocks();
	});

	it("存在しないOpenAPIファイルでエラーを返す", () => {
		mkdirSync(join(tempDir, "src"));

		const result = run({
			openapi: "nonexistent.json",
			src: "./src",
		});

		expect(result.success).toBe(false);
		expect(result.exitCode).toBe(1);
		expect(result.error).toContain("OpenAPI spec not found");
	});

	it("存在しないソースディレクトリでエラーを返す", () => {
		writeFileSync(join(tempDir, "openapi.json"), JSON.stringify({ paths: {} }));

		const result = run({
			openapi: "openapi.json",
			src: "./nonexistent",
		});

		expect(result.success).toBe(false);
		expect(result.exitCode).toBe(1);
		expect(result.error).toContain("Source directory not found");
	});

	it("有効な入力で成功を返す", () => {
		writeFileSync(
			join(tempDir, "openapi.json"),
			JSON.stringify({ paths: { "/users": { get: {} } } }),
		);
		mkdirSync(join(tempDir, "src"));
		writeFileSync(join(tempDir, "src", "api.ts"), "// empty");

		const result = run({
			openapi: "openapi.json",
			src: "./src",
		});

		expect(result.success).toBe(true);
		expect(result.exitCode).toBe(0);
	});

	it("--checkで未使用APIがある場合はexit 1", () => {
		writeFileSync(
			join(tempDir, "openapi.json"),
			JSON.stringify({ paths: { "/users": { get: {} } } }),
		);
		mkdirSync(join(tempDir, "src"));
		writeFileSync(join(tempDir, "src", "api.ts"), "// no api calls");

		const result = run({
			openapi: "openapi.json",
			src: "./src",
			check: true,
		});

		expect(result.success).toBe(true);
		expect(result.exitCode).toBe(1);
	});

	it("--checkで全API使用時はexit 0", () => {
		writeFileSync(
			join(tempDir, "openapi.json"),
			JSON.stringify({ paths: { "/users": { get: {} } } }),
		);
		mkdirSync(join(tempDir, "src"));
		writeFileSync(
			join(tempDir, "src", "api.ts"),
			'const client = {}; client.GET("/users");',
		);

		const result = run({
			openapi: "openapi.json",
			src: "./src",
			check: true,
		});

		expect(result.success).toBe(true);
		expect(result.exitCode).toBe(0);
	});
});
