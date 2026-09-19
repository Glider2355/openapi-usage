import { describe, expect, it } from "vitest";
import { createProgram, parseArgs } from "./cli.js";

describe("createProgram", () => {
	it("プログラムを作成できる", () => {
		const program = createProgram();
		expect(program.name()).toBe("openapi-usage");
	});
});

describe("parseArgs", () => {
	it("基本オプションをパースできる", () => {
		const program = createProgram();
		program.exitOverride();

		const options = parseArgs(program, ["-o", "openapi.json", "-s", "./src"]);

		expect(options.openapi).toBe("openapi.json");
		expect(options.src).toEqual(["./src"]);
	});

	it("全オプションをパースできる", () => {
		const program = createProgram();
		program.exitOverride();

		const options = parseArgs(program, [
			"-o",
			"openapi.json",
			"-s",
			"./src",
			"--output",
			"result.json",
			"--check",
			"--level",
			"warn",
			"-c",
			"config.yaml",
		]);

		expect(options.openapi).toBe("openapi.json");
		expect(options.src).toEqual(["./src"]);
		expect(options.output).toBe("result.json");
		expect(options.check).toBe(true);
		expect(options.level).toBe("warn");
		expect(options.config).toBe("config.yaml");
	});

	it("--srcを複数回指定すると配列になる", () => {
		const program = createProgram();
		program.exitOverride();

		const options = parseArgs(program, [
			"-s",
			"packages/frontend/src",
			"-s",
			"e2e/api",
		]);

		expect(options.src).toEqual(["packages/frontend/src", "e2e/api"]);
	});

	it("オプションなしでもパースできる（設定ファイル使用時）", () => {
		const program = createProgram();
		program.exitOverride();

		const options = parseArgs(program, ["-c", "openapi-usage.yaml"]);

		expect(options.openapi).toBeUndefined();
		expect(options.src).toBeUndefined();
		expect(options.config).toBe("openapi-usage.yaml");
	});
});
