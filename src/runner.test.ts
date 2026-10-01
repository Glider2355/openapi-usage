import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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
		vi.spyOn(console, "warn").mockImplementation(() => {});
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

	const writeSpec = (paths: Record<string, unknown>) =>
		writeFileSync(join(tempDir, "openapi.json"), JSON.stringify({ paths }));

	const writeSrc = (dir: string, file: string, content: string) => {
		mkdirSync(join(tempDir, dir), { recursive: true });
		writeFileSync(join(tempDir, dir, file), content);
	};

	const writeConfig = (yaml: string) => {
		writeFileSync(join(tempDir, "openapi-usage.yaml"), yaml);
	};

	const logged = () =>
		(console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
			.map((args) => String(args[0] ?? ""))
			.join("\n");

	const warned = () =>
		(console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
			.map((args) => String(args[0] ?? ""))
			.join("\n");

	describe("level検証（#54）", () => {
		it("configのlevelが不正ならexit 1で終了する", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", "// empty");
			writeConfig("level: warning\n");

			const result = run({ openapi: "openapi.json", src: "./src" });

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.error).toContain('invalid level "warning"');
		});

		it("CLIの--levelが不正ならexit 1で終了する", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", "// empty");

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				level: "Error",
			});

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.error).toContain('invalid level "Error"');
		});

		it("level: warnなら未使用APIがあってもexit 0", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", "// no api calls");
			writeConfig("level: warn\n");

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
			});

			expect(result.exitCode).toBe(0);
		});

		it("未知のconfigキーは警告して続行する", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", "// empty");
			writeConfig("levell: warn\n");

			const result = run({ openapi: "openapi.json", src: "./src" });

			expect(result.success).toBe(true);
			expect(warned()).toContain('unknown config key "levell"');
		});
	});

	describe("--checkの副作用（#55）", () => {
		it("--checkではconfigのoutputを書き込まない", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig("output: ./api-usage.json\n");

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
			});

			expect(result.exitCode).toBe(0);
			expect(existsSync(join(tempDir, "api-usage.json"))).toBe(false);
			expect(logged()).toContain("Skipped writing output file in check mode");
		});

		it("--checkでも明示的な--outputは書き込む", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig("output: ./from-config.json\n");

			run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
				output: "./explicit.json",
			});

			expect(existsSync(join(tempDir, "explicit.json"))).toBe(true);
			expect(existsSync(join(tempDir, "from-config.json"))).toBe(false);
		});

		it("--checkなしならconfigのoutputを書き込む", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig("output: ./api-usage.json\n");

			run({ openapi: "openapi.json", src: "./src" });

			expect(existsSync(join(tempDir, "api-usage.json"))).toBe(true);
		});
	});

	describe("死んだignoreパターンの警告（#56）", () => {
		it("どのendpointにもマッチしないignoreを警告する", () => {
			writeSpec({ "/users": { get: {} }, "/health": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig(`
ignore:
  - "GET /health"
  - "GET /sounds/*"
`);

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
			});

			expect(result.exitCode).toBe(0);
			expect(warned()).toContain(
				'warning: ignore pattern "GET /sounds/*" matched no endpoint',
			);
			expect(warned()).not.toContain('"GET /health" matched no endpoint');
		});
	});

	describe("複数src（#57）", () => {
		it("いずれかのsrcで使われていれば未使用にしない", () => {
			writeSpec({ "/users": { get: {} }, "/admin": { get: {} } });
			writeSrc("app/src", "api.ts", 'const client = {}; client.GET("/users");');
			writeSrc(
				"e2e",
				"admin.spec.ts",
				'const client = {}; client.GET("/admin");',
			);

			const result = run({
				openapi: "openapi.json",
				src: ["./app/src", "./e2e"],
				check: true,
			});

			expect(result.exitCode).toBe(0);
			expect(logged()).toContain("Unused APIs per source:");
			expect(logged()).toContain("app/src: 1");
			expect(logged()).toContain("e2e: 1");
		});

		it("configのsrc配列でも動作する", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("app/src", "api.ts", "// empty");
			writeSrc(
				"e2e",
				"users.spec.ts",
				'const client = {}; client.GET("/users");',
			);
			writeConfig(`
src:
  - ./app/src
  - ./e2e
`);

			const result = run({ openapi: "openapi.json", check: true });

			expect(result.exitCode).toBe(0);
		});
	});

	describe("呼び出し位置ルール（#58）", () => {
		it("許可ディレクトリ外の呼び出しでexit 1", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig(`
locations:
  "*":
    - "src/hooks/api/**"
`);

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
			});

			expect(result.exitCode).toBe(1);
			expect(logged()).toContain("Location violations: 1");
			expect(logged()).toContain("GET /users at src/api.ts");
		});

		it("許可ディレクトリ内ならexit 0", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc(
				"src/hooks/api",
				"useUsers.ts",
				'const client = {}; client.GET("/users");',
			);
			writeConfig(`
locations:
  "*":
    - "src/hooks/api/**"
`);

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
			});

			expect(result.exitCode).toBe(0);
		});

		it("level: warnなら違反があってもexit 0", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig(`
level: warn
locations:
  "*":
    - "src/hooks/api/**"
`);

			const result = run({
				openapi: "openapi.json",
				src: "./src",
				check: true,
			});

			expect(result.exitCode).toBe(0);
			expect(logged()).toContain("Location violations: 1");
		});
	});

	describe("呼び出し位置ルールとJSON出力", () => {
		it("--checkなしでoutputを書き込む場合も違反を表示する", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig(`
output: ./api-usage.json
locations:
  "*":
    - "src/hooks/api"
`);

			const result = run({ openapi: "openapi.json", src: "./src" });

			expect(result.exitCode).toBe(0);
			expect(existsSync(join(tempDir, "api-usage.json"))).toBe(true);
			expect(logged()).toContain("Location violations: 1");
		});
	});

	describe("理由付きignoreのJSON出力（#59）", () => {
		it("ignore済みでも使用箇所をJSONに残す", () => {
			writeSpec({ "/users": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig(`
output: ./api-usage.json
ignore:
  - "GET /users"
`);

			run({ openapi: "openapi.json", src: "./src" });

			const output = JSON.parse(
				readFileSync(join(tempDir, "api-usage.json"), "utf-8"),
			);

			expect(output.endpoints).toEqual([
				{
					method: "GET",
					path: "/users",
					usages: [{ file: "src/api.ts", line: 1 }],
					ignored: true,
				},
			]);
		});

		it("ignored/reasonをJSONに含める", () => {
			writeSpec({ "/users": { get: {} }, "/health": { get: {} } });
			writeSrc("src", "api.ts", 'const client = {}; client.GET("/users");');
			writeConfig(`
output: ./api-usage.json
ignore:
  - pattern: "GET /health"
    reason: "監視用"
`);

			run({ openapi: "openapi.json", src: "./src" });

			const output = JSON.parse(
				readFileSync(join(tempDir, "api-usage.json"), "utf-8"),
			);

			expect(output.summary).toEqual({
				total: 2,
				used: 1,
				unused: 0,
				ignored: 1,
			});
			expect(output.endpoints).toEqual([
				{
					method: "GET",
					path: "/health",
					usages: [],
					ignored: true,
					reason: "監視用",
				},
				{
					method: "GET",
					path: "/users",
					usages: [{ file: "src/api.ts", line: 1 }],
				},
			]);
		});
	});
});
