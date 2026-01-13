import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = join(import.meta.dirname, "../.cli-test-fixtures");
const SRC_DIR = join(TEST_DIR, "src");
const OPENAPI_PATH = join(TEST_DIR, "openapi.json");
const OUTPUT_PATH = join(TEST_DIR, "output.json");

function runCLI(args: string): { exitCode: number; stdout: string } {
	try {
		const stdout = execSync(
			`pnpm tsx src/index.ts --openapi ${OPENAPI_PATH} --src ${SRC_DIR} ${args}`,
			{ encoding: "utf-8", cwd: join(import.meta.dirname, "..") },
		);
		return { exitCode: 0, stdout };
	} catch (error) {
		const execError = error as { status: number; stdout: string };
		return { exitCode: execError.status, stdout: execError.stdout || "" };
	}
}

describe("CLI E2E", () => {
	beforeEach(() => {
		mkdirSync(SRC_DIR, { recursive: true });
		// Create minimal tsconfig.json required by ts-morph
		writeFileSync(
			join(TEST_DIR, "tsconfig.json"),
			JSON.stringify({ compilerOptions: {} }),
		);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("should exit 0 when all APIs are used", () => {
		writeFileSync(
			OPENAPI_PATH,
			JSON.stringify({
				paths: {
					"/users": { get: {} },
				},
			}),
		);

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = createClient();
client.GET("/users");
`,
		);

		const { exitCode } = runCLI("--check");
		expect(exitCode).toBe(0);
	});

	it("should exit 1 when there are unused APIs", () => {
		writeFileSync(
			OPENAPI_PATH,
			JSON.stringify({
				paths: {
					"/users": { get: {} },
					"/posts": { get: {} },
				},
			}),
		);

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = createClient();
client.GET("/users");
`,
		);

		const { exitCode } = runCLI("--check");
		expect(exitCode).toBe(1);
	});

	it("should generate JSON output file", () => {
		writeFileSync(
			OPENAPI_PATH,
			JSON.stringify({
				paths: {
					"/users": { get: {} },
				},
			}),
		);

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = createClient();
client.GET("/users");
`,
		);

		runCLI(`--output ${OUTPUT_PATH}`);

		const output = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
		expect(output.summary.total).toBe(1);
		expect(output.summary.used).toBe(1);
		expect(output.summary.unused).toBe(0);
		expect(output.endpoints).toHaveLength(1);
		expect(output.endpoints[0].method).toBe("GET");
		expect(output.endpoints[0].path).toBe("/users");
	});

	it("should exit 1 when openapi file not found", () => {
		writeFileSync(join(SRC_DIR, "api.ts"), "");

		const { exitCode } = runCLI("--check");
		expect(exitCode).toBe(1);
	});

	it("should show tree output with --check", () => {
		writeFileSync(
			OPENAPI_PATH,
			JSON.stringify({
				paths: {
					"/users": { get: {} },
					"/posts": { delete: {} },
				},
			}),
		);

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = createClient();
client.GET("/users");
`,
		);

		const { stdout, exitCode } = runCLI("--check");
		expect(exitCode).toBe(1);
		expect(stdout).toContain("GET /users");
		expect(stdout).toContain("DELETE /posts");
		expect(stdout).toContain("未使用");
	});
});
