import { Command } from "commander";

export interface CliOptions {
	openapi: string;
	src: string;
	output?: string;
	check?: boolean;
}

/**
 * CLIプログラムを作成する
 * @returns Commanderプログラムインスタンス
 */
export function createProgram(): Command {
	return new Command()
		.name("openapi-usage")
		.description("Analyze API usage based on OpenAPI spec")
		.requiredOption("-o, --openapi <path>", "Path to OpenAPI spec file")
		.requiredOption("-s, --src <path>", "Path to source directory")
		.option("--output <path>", "Output JSON file path")
		.option("--check", "Check mode (exit 1 if unused APIs exist)");
}

/**
 * コマンドライン引数をパースしてオプションを取得する
 * @param program - Commanderプログラムインスタンス
 * @param args - 引数配列（テスト用、省略時はprocess.argvを使用）
 * @returns パースされたCLIオプション
 */
export function parseArgs(program: Command, args?: string[]): CliOptions {
	if (args) {
		program.parse(args, { from: "user" });
	} else {
		program.parse();
	}
	return program.opts<CliOptions>();
}
