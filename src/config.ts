import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { SeverityLevel } from "./cli.js";

/**
 * ignoreエントリ。文字列（パターンのみ）とobject（理由付き）の両方を受け付ける
 */
export type IgnoreEntry = string | { pattern: string; reason?: string };

/** 正規化済みのignoreエントリ */
export interface IgnoreRule {
	pattern: string;
	reason?: string;
}

export interface Config {
	openapi?: string;
	src?: string | string[];
	output?: string;
	level?: SeverityLevel;
	ignore?: IgnoreEntry[];
	locations?: Record<string, string[]>;
}

export interface LoadConfigResult {
	success: true;
	config: Config;
	warnings: string[];
}

export interface LoadConfigError {
	success: false;
	error: string;
}

export const severityLevelSchema = z.enum(["error", "warn"], {
	error: (issue) =>
		`invalid level ${JSON.stringify(issue.input)} (expected "error" or "warn")`,
});

const ignoreEntrySchema = z.union([
	z.string(),
	z.object({
		pattern: z.string(),
		reason: z.string().optional(),
	}),
]);

const configSchema = z.object({
	openapi: z.string().optional(),
	src: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	output: z.string().optional(),
	level: severityLevelSchema.optional(),
	ignore: z.array(ignoreEntrySchema).optional(),
	locations: z.record(z.string(), z.array(z.string()).min(1)).optional(),
});

const KNOWN_CONFIG_KEYS = new Set(Object.keys(configSchema.shape));

const DEFAULT_CONFIG_FILES = [
	"openapi-usage.yaml",
	"openapi-usage.yml",
	".openapi-usage.yaml",
	".openapi-usage.yml",
];

function formatIssues(issues: z.core.$ZodIssue[]): string {
	return issues
		.map((issue) => {
			const path = issue.path.join(".");
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join(", ");
}

function collectUnknownKeys(parsed: object, source: string): string[] {
	return Object.keys(parsed)
		.filter((key) => !KNOWN_CONFIG_KEYS.has(key))
		.map((key) => `unknown config key "${key}" in ${source} (ignored)`);
}

/**
 * 設定ファイルを探して読み込み、スキーマ検証する
 * @param configPath - 明示的に指定された設定ファイルパス（省略時はデフォルトファイルを探索）
 * @returns 検証済みの設定オブジェクト（+警告）またはエラー
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
		return { success: true, config: {}, warnings: [] };
	}

	let raw: unknown;
	try {
		raw = parse(readFileSync(resolvedPath, "utf-8"));
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { success: false, error: `Failed to parse config file: ${message}` };
	}

	if (raw == null) {
		return { success: true, config: {}, warnings: [] };
	}

	if (typeof raw !== "object" || Array.isArray(raw)) {
		return {
			success: false,
			error: `Invalid config file ${resolvedPath}: expected a mapping of options`,
		};
	}

	const result = configSchema.safeParse(raw);
	if (!result.success) {
		return {
			success: false,
			error: `Invalid config file ${resolvedPath}: ${formatIssues(result.error.issues)}`,
		};
	}

	return {
		success: true,
		config: result.data,
		warnings: collectUnknownKeys(raw, resolvedPath),
	};
}

/**
 * ignoreエントリを正規化する（文字列/object の混在を IgnoreRule[] に揃える）
 * @param entries - 設定ファイルのignoreエントリ
 * @returns 正規化済みルールの配列
 */
export function normalizeIgnoreRules(entries: IgnoreEntry[]): IgnoreRule[] {
	return entries.map((entry) =>
		typeof entry === "string" ? { pattern: entry } : entry,
	);
}

/**
 * "METHOD /path" 形式のキーがパターンにマッチするか判定する
 * `*` は任意の文字列にマッチする
 * @param endpoint - "METHOD /path" 形式のエンドポイント
 * @param pattern - マッチ対象のパターン
 * @returns マッチした場合はtrue
 */
export function matchEndpointPattern(
	endpoint: string,
	pattern: string,
): boolean {
	if (!pattern.includes("*")) {
		return endpoint === pattern;
	}

	const regex = new RegExp(
		`^${pattern.replace(/\*/g, ".*").replace(/\//g, "\\/")}$`,
	);
	return regex.test(endpoint);
}

/**
 * エンドポイントがignoreリストにマッチするか判定
 * @param endpoint - "METHOD /path" 形式のエンドポイント
 * @param ignoreEntries - ignoreパターンの配列（文字列または理由付きobject）
 * @returns マッチした場合はtrue
 */
export function isIgnored(
	endpoint: string,
	ignoreEntries: IgnoreEntry[],
): boolean {
	return normalizeIgnoreRules(ignoreEntries).some((rule) =>
		matchEndpointPattern(endpoint, rule.pattern),
	);
}
