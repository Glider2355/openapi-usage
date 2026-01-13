import { describe, expect, it } from "vitest";
import { createProgram, parseArgs } from "./cli.js";

describe("createProgram", () => {
	it("プログラムを作成できる", () => {
		const program = createProgram();
		expect(program.name()).toBe("openapi-usage");
	});
});

describe("parseArgs", () => {
	it("必須オプションをパースできる", () => {
		const program = createProgram();
		program.exitOverride();

		const options = parseArgs(program, ["-o", "openapi.json", "-s", "./src"]);

		expect(options.openapi).toBe("openapi.json");
		expect(options.src).toBe("./src");
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
		]);

		expect(options.openapi).toBe("openapi.json");
		expect(options.src).toBe("./src");
		expect(options.output).toBe("result.json");
		expect(options.check).toBe(true);
	});

	it("必須オプションが欠けている場合はエラー", () => {
		const program = createProgram();
		program.exitOverride();

		expect(() => parseArgs(program, ["-o", "openapi.json"])).toThrow();
	});
});
