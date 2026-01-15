import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { SeverityLevel } from "./cli.js";

export interface Config {
	openapi?: string;
	src?: string;
	output?: string;
	level?: SeverityLevel;
	ignore?: string[];
}

export interface LoadConfigResult {
	success: true;
	config: Config;
}

export interface LoadConfigError {
	success: false;
	error: string;
}

const DEFAULT_CONFIG_FILES = [
	"openapi-usage.yaml",
	"openapi-usage.yml",
	".openapi-usage.yaml",
	".openapi-usage.yml",
];

/**
 * 設定ファイルを探して読み込む
 * @param configPath - 明示的に指定された設定ファイルパス（省略時はデフォルトファイルを探索）
 * @returns 設定オブジェクトまたはエラー
 */
export function loadConfig(
	configPath?: string,
): LoadConfigResult | LoadConfigError {
	let resolvedPath: string | undefined;

	if (configPath) {
		resolvedPath = resolve(process.cwd(), configPath);
		if (!existsSync(resolvedPath)) {
			return {
				success: false,
				error: `Config file not found: ${resolvedPath}`,
			};
		}
	} else {
		for (const filename of DEFAULT_CONFIG_FILES) {
			const candidate = resolve(process.cwd(), filename);
			if (existsSync(candidate)) {
				resolvedPath = candidate;
				break;
			}
		}
	}

	if (!resolvedPath) {
		return { success: true, config: {} };
	}

	try {
		const content = readFileSync(resolvedPath, "utf-8");
		const parsed = parse(content) as Config | null;
		return { success: true, config: parsed ?? {} };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { success: false, error: `Failed to parse config file: ${message}` };
	}
}

/**
 * エンドポイントがignoreリストにマッチするか判定
 * @param endpoint - "METHOD /path" 形式のエンドポイント
 * @param ignorePatterns - ignoreパターンの配列
 * @returns マッチした場合はtrue
 */
export function isIgnored(endpoint: string, ignorePatterns: string[]): boolean {
	for (const pattern of ignorePatterns) {
		if (pattern.includes("*")) {
			const regex = new RegExp(
				`^${pattern.replace(/\*/g, ".*").replace(/\//g, "\\/")}$`,
			);
			if (regex.test(endpoint)) {
				return true;
			}
		} else if (endpoint === pattern) {
			return true;
		}
	}
	return false;
}
