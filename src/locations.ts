import { matchEndpointPattern } from "./config.js";
import type { Usage } from "./types.js";

/** 呼び出し位置ルール違反 */
export interface LocationViolation {
	endpoint: string;
	file: string;
	line: number;
	/** マッチしたendpointパターン */
	pattern: string;
	/** 許可されているディレクトリglob */
	allowed: string[];
}

/** endpointパターンと許可ディレクトリglobの組 */
export interface LocationRule {
	pattern: string;
	allowed: string[];
}

function escapeRegexChar(char: string): string {
	return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * ディレクトリglobを正規表現に変換する
 * `**` はディレクトリ境界を越えてマッチし、`*` は越えない
 */
function globToRegex(glob: string): RegExp {
	let pattern = "";
	let i = 0;

	while (i < glob.length) {
		if (glob.startsWith("**/", i)) {
			pattern += "(?:.*/)?";
			i += 3;
		} else if (glob.startsWith("**", i)) {
			pattern += ".*";
			i += 2;
		} else if (glob[i] === "*") {
			pattern += "[^/]*";
			i += 1;
		} else {
			pattern += escapeRegexChar(glob[i]);
			i += 1;
		}
	}

	return new RegExp(`^${pattern}$`);
}

/**
 * ファイルパスがディレクトリglobにマッチするか判定する
 * @param filePath - 判定対象のファイルパス（cwd相対）
 * @param glob - ディレクトリglob（例: "src/hooks/api/**"）
 * @returns マッチした場合はtrue
 */
export function matchPathGlob(filePath: string, glob: string): boolean {
	return globToRegex(normalizePath(glob)).test(normalizePath(filePath));
}

/**
 * パターンの具体度（ワイルドカードを除いた文字数）
 * 具体度が高いルールを優先して適用する
 */
function specificity(pattern: string): number {
	return pattern.replace(/\*/g, "").length;
}

/**
 * endpointに適用される位置ルールを検索する
 * 複数マッチする場合は最も具体的なパターンが優先される
 * @param endpoint - "METHOD /path" 形式のエンドポイント
 * @param locations - endpointパターン → 許可ディレクトリglobのマップ
 * @returns 適用されるルール、なければnull
 */
export function findLocationRule(
	endpoint: string,
	locations: Record<string, string[]>,
): LocationRule | null {
	const matched = Object.entries(locations)
		.filter(([pattern]) => matchEndpointPattern(endpoint, pattern))
		.sort(([a], [b]) => specificity(b) - specificity(a) || b.length - a.length);

	const rule = matched[0];
	return rule ? { pattern: rule[0], allowed: rule[1] } : null;
}

/**
 * 呼び出し位置が許可ディレクトリの外にあるものを検出する
 * @param usages - エンドポイントごとの使用箇所マップ
 * @param locations - endpointパターン → 許可ディレクトリglobのマップ
 * @returns 違反の配列
 */
export function findLocationViolations(
	usages: Map<string, Usage[]>,
	locations: Record<string, string[]>,
): LocationViolation[] {
	const violations: LocationViolation[] = [];

	for (const [endpoint, usageList] of usages) {
		const rule = findLocationRule(endpoint, locations);
		if (!rule) continue;

		for (const usage of usageList) {
			const allowed = rule.allowed.some((glob) =>
				matchPathGlob(usage.file, glob),
			);
			if (!allowed) {
				violations.push({
					endpoint,
					file: usage.file,
					line: usage.line,
					pattern: rule.pattern,
					allowed: rule.allowed,
				});
			}
		}
	}

	return violations;
}
