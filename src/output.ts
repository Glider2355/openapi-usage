import type { ApiDependencies, Endpoint, Usage } from "./types.js";

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
	const separator = "─".repeat(35);

	if (unused.length === 0) {
		return [separator, "Unused APIs: 0"];
	}

	return [
		separator,
		`Unused APIs: ${unused.length}`,
		...unused.map((endpoint) => `  - ${endpoint}`),
	];
};

/**
 * API使用状況をJSON出力用のオブジェクトに変換する
 * @param usages - エンドポイントごとの使用箇所マップ
 * @returns JSON出力用のApiDependenciesオブジェクト
 */
export const generateJsonOutput = (
	usages: Map<string, Usage[]>,
): ApiDependencies => {
	const entries = sortByKey([...usages.entries()]);

	const endpoints: Endpoint[] = entries.map(([key, usageList]) => {
		const [method, path] = key.split(" ", 2);
		return { method, path, usages: usageList };
	});

	const used = entries.filter(([, list]) => list.length > 0).length;

	return {
		endpoints,
		summary: {
			total: endpoints.length,
			used,
			unused: endpoints.length - used,
		},
	};
};
