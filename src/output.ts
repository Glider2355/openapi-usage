import type { IgnoreRule } from "./config.js";
import type { LocationViolation } from "./locations.js";
import type { ApiDependencies, Endpoint, Usage } from "./types.js";

const SEPARATOR = "─".repeat(35);

const toPosixPath = (path: string): string => path.replace(/\\/g, "/");

const sortByKey = <T>(entries: [string, T][]): [string, T][] =>
	entries.sort((a, b) => a[0].localeCompare(b[0]));

const formatUsageLines = (key: string, usages: Usage[]): string[] => {
	if (usages.length === 0) {
		return [key, "└─ (unused)", ""];
	}

	const usageLines = usages.map((usage, index) => {
		const prefix = index === usages.length - 1 ? "└─" : "├─";
		return `${prefix} ${usage.file}:${usage.line}`;
	});

	return [key, ...usageLines, ""];
};

/**
 * API使用状況をツリー形式の文字列配列に変換する
 * @param usages - エンドポイントごとの使用箇所マップ
 * @returns ツリー形式の出力行配列
 */
export const formatTree = (usages: Map<string, Usage[]>): string[] =>
	sortByKey([...usages.entries()]).flatMap(([key, list]) =>
		formatUsageLines(key, list),
	);

/**
 * 未使用のエンドポイント一覧を取得する
 * @param usages - エンドポイントごとの使用箇所マップ
 * @returns 未使用エンドポイントキーの配列
 */
export const getUnusedEndpoints = (usages: Map<string, Usage[]>): string[] =>
	[...usages.entries()]
		.filter(([, list]) => list.length === 0)
		.map(([key]) => key);

/**
 * 未使用API数のサマリーを文字列配列に変換する
 * @param usages - エンドポイントごとの使用箇所マップ
 * @returns サマリー出力行配列
 */
export const formatSummary = (usages: Map<string, Usage[]>): string[] => {
	const unused = getUnusedEndpoints(usages);

	if (unused.length === 0) {
		return [SEPARATOR, "Unused APIs: 0"];
	}

	return [
		SEPARATOR,
		`Unused APIs: ${unused.length}`,
		...unused.map((endpoint) => `  - ${endpoint}`),
	];
};

/**
 * ソースディレクトリごとの未使用API数を文字列配列に変換する
 * 複数の src を指定したときに「どのソースからは未使用か」を示す
 * @param usages - エンドポイントごとの使用箇所マップ
 * @param srcPaths - ソースディレクトリのパス（使用箇所のfileと同じ基準の相対パス）
 * @returns サマリー出力行配列（srcが1つ以下なら空配列）
 */
export const formatSourceSummary = (
	usages: Map<string, Usage[]>,
	srcPaths: string[],
): string[] => {
	if (srcPaths.length <= 1) {
		return [];
	}

	const lines = srcPaths.map((srcPath) => {
		const root = toPosixPath(srcPath).replace(/\/+$/, "");
		// srcがカレントディレクトリ自身（"" または "."）の場合は全ファイルが対象
		const prefix = root === "" || root === "." ? "" : `${root}/`;
		const unused = [...usages.values()].filter(
			(list) =>
				!list.some((usage) => toPosixPath(usage.file).startsWith(prefix)),
		).length;
		return `  ${srcPath || "."}: ${unused}`;
	});

	return ["Unused APIs per source:", ...lines];
};

/**
 * ignore済みエンドポイントを理由付きで文字列配列に変換する
 * @param ignored - エンドポイント → 適用されたignoreルールのマップ
 * @returns 出力行配列（ignoreが無ければ空配列）
 */
export const formatIgnoredEndpoints = (
	ignored: Map<string, IgnoreRule>,
): string[] => {
	if (ignored.size === 0) {
		return [];
	}

	const lines = sortByKey([...ignored.entries()]).map(([endpoint, rule]) =>
		rule.reason ? `  - ${endpoint} (${rule.reason})` : `  - ${endpoint}`,
	);

	return [`Ignored APIs: ${ignored.size}`, ...lines];
};

/**
 * どのエンドポイントにもマッチしなかったignoreパターンの警告を生成する
 * @param unmatched - マッチ数0だったignoreルール
 * @returns 警告行配列
 */
export const formatUnmatchedIgnoreWarnings = (
	unmatched: IgnoreRule[],
): string[] =>
	unmatched.map(
		(rule) => `warning: ignore pattern "${rule.pattern}" matched no endpoint`,
	);

/**
 * 呼び出し位置ルール違反を文字列配列に変換する
 * @param violations - 違反の配列
 * @returns 出力行配列（違反が無ければ空配列）
 */
export const formatLocationViolations = (
	violations: LocationViolation[],
): string[] => {
	if (violations.length === 0) {
		return [];
	}

	const lines = violations.flatMap((violation) => [
		`  - ${violation.endpoint} at ${violation.file}:${violation.line}`,
		`    allowed: ${violation.allowed.join(", ")} (rule: "${violation.pattern}")`,
	]);

	return [SEPARATOR, `Location violations: ${violations.length}`, ...lines];
};

/**
 * API使用状況をJSON出力用のオブジェクトに変換する
 * @param usages - エンドポイントごとの使用箇所マップ（ignore済みを含めてよい）
 * @param ignored - ignoreされたエンドポイント → 適用されたignoreルールのマップ
 * @returns JSON出力用のApiDependenciesオブジェクト
 */
export const generateJsonOutput = (
	usages: Map<string, Usage[]>,
	ignored: Map<string, IgnoreRule> = new Map(),
): ApiDependencies => {
	// usagesに含まれないignore済みエンドポイントは使用箇所なしとして補う
	const all = new Map(usages);
	for (const key of ignored.keys()) {
		if (!all.has(key)) {
			all.set(key, []);
		}
	}

	const endpoints: Endpoint[] = sortByKey([...all.entries()]).map(
		([key, usageList]) => {
			const [method, path] = key.split(" ", 2);
			const endpoint: Endpoint = { method, path, usages: usageList };
			const rule = ignored.get(key);
			if (!rule) {
				return endpoint;
			}
			return {
				...endpoint,
				ignored: true,
				...(rule.reason ? { reason: rule.reason } : {}),
			};
		},
	);

	const active = endpoints.filter((endpoint) => !endpoint.ignored);
	const used = active.filter((endpoint) => endpoint.usages.length > 0).length;

	return {
		endpoints,
		summary: {
			total: endpoints.length,
			used,
			unused: active.length - used,
			ignored: endpoints.length - active.length,
		},
	};
};
