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
			`pnpm tsx src/bin.ts --openapi ${OPENAPI_PATH} --src ${SRC_DIR} ${args}`,
			{ encoding: "utf-8", cwd: join(import.meta.dirname, "..") },
		);
		return { exitCode: 0, stdout };
	} catch (error) {
		const execError = error as { status: number; stdout: string };
		return { exitCode: execError.status, stdout: execError.stdout || "" };
	}
}

describe("CLI E2Eテスト", () => {
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

	it("全てのAPIが使用されている場合はexit 0で終了する", () => {
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

	it("未使用のAPIがある場合はexit 1で終了する", () => {
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

	it("JSON出力ファイルを生成する", () => {
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

	it("OpenAPIファイルが見つからない場合はexit 1で終了する", () => {
		writeFileSync(join(SRC_DIR, "api.ts"), "");

		const { exitCode } = runCLI("--check");
		expect(exitCode).toBe(1);
	});

	it("パスパラメータをマッチングする", () => {
		writeFileSync(
			OPENAPI_PATH,
			JSON.stringify({
				paths: {
					"/users/{id}": { get: {} },
					"/users/{userId}/posts/{postId}": { delete: {} },
				},
			}),
		);

		writeFileSync(
			join(SRC_DIR, "api.ts"),
			`
const client = createClient();
client.GET("/users/123");
client.DELETE("/users/456/posts/789");
`,
		);

		const { exitCode } = runCLI("--check");
		expect(exitCode).toBe(0);
	});

	it("--checkでツリー出力を表示する", () => {
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

		// ログ行を除去し、ツリー出力部分のみ抽出
		const treeOutput = stdout
			.split("\n")
			.filter(
				(line) =>
					!line.startsWith("Parsing") &&
					!line.startsWith("Found") &&
					!line.startsWith("Analyzing"),
			)
			.join("\n")
			.replace(/:\d+/g, ""); // 行番号除去

		expect(treeOutput).toMatchInlineSnapshot(`
			"
			DELETE /posts
			└─ (unused)

			GET /users
			└─ src/api.ts

			───────────────────────────────────
			Unused APIs: 1
			  - DELETE /posts
			"
		`);
	});
});
