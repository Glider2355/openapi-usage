import { Command } from "commander";

export type SeverityLevel = "error" | "warn";

export interface CliOptions {
	openapi?: string;
	/** 解析対象ディレクトリ。--src を複数回指定すると配列になる */
	src?: string | string[];
	output?: string;
	check?: boolean;
	/** "error" | "warn"。不正値は起動時に検証してエラー終了する */
	level?: string;
	config?: string;
}

function collect(value: string, previous?: string[]): string[] {
	return [...(previous ?? []), value];
}

/**
 * CLIプログラムを作成する
 * @returns Commanderプログラムインスタンス
 */
export function createProgram(): Command {
	return new Command()
		.name("openapi-usage")
		.description("Analyze API usage based on OpenAPI spec")
		.option("-o, --openapi <path>", "Path to OpenAPI spec file")
		.option(
			"-s, --src <path>",
			"Path to source directory (repeatable)",
			collect,
		)
		.option("--output <path>", "Output JSON file path")
		.option("--check", "Check mode (exit 1 if unused APIs exist)")
		.option(
			"--level <level>",
			'Severity level for unused APIs: "error" or "warn"',
		)
		.option("-c, --config <path>", "Path to config file (YAML)");
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
