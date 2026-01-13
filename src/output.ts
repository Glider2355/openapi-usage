import type { ApiDependencies, Endpoint, Usage } from "./types.js";

/**
 * Format usages as tree output lines
 */
export function formatTree(usages: Map<string, Usage[]>): string[] {
	const lines: string[] = [];

	for (const [key, usageList] of [...usages.entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		lines.push(key);

		if (usageList.length === 0) {
			lines.push("└─ (未使用)");
		} else {
			usageList.forEach((usage, index) => {
				const isLast = index === usageList.length - 1;
				const prefix = isLast ? "└─" : "├─";
				lines.push(`${prefix} ${usage.file}:${usage.line}`);
			});
		}
		lines.push("");
	}

	return lines;
}

/**
 * Get unused endpoints from usages
 */
export function getUnusedEndpoints(usages: Map<string, Usage[]>): string[] {
	const unused: string[] = [];

	for (const [key, usageList] of usages) {
		if (usageList.length === 0) {
			unused.push(key);
		}
	}

	return unused;
}

/**
 * Format summary output lines
 */
export function formatSummary(usages: Map<string, Usage[]>): string[] {
	const lines: string[] = [];
	const unusedEndpoints = getUnusedEndpoints(usages);

	lines.push("─".repeat(35));

	if (unusedEndpoints.length === 0) {
		lines.push("未使用 API: 0件");
	} else {
		lines.push(`未使用 API: ${unusedEndpoints.length}件`);
		for (const endpoint of unusedEndpoints) {
			lines.push(`  - ${endpoint}`);
		}
	}

	return lines;
}

/**
 * Generate JSON output structure
 */
export function generateJsonOutput(
	usages: Map<string, Usage[]>,
	generatedAt?: Date,
): ApiDependencies {
	const endpoints: Endpoint[] = [];
	let used = 0;
	let unused = 0;

	for (const [key, usageList] of [...usages.entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		const [method, path] = key.split(" ", 2);

		endpoints.push({
			method,
			path,
			usages: usageList,
		});

		if (usageList.length > 0) {
			used++;
		} else {
			unused++;
		}
	}

	return {
		generated_at: (generatedAt ?? new Date()).toISOString(),
		endpoints,
		summary: {
			total: endpoints.length,
			used,
			unused,
		},
	};
}
