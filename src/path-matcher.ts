function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseEndpointKey(key: string): { method: string; path: string } {
	const [method, path] = key.split(" ", 2);
	return { method, path };
}

function createPathRegex(endpointPath: string): RegExp {
	const escapedPath = escapeRegex(endpointPath);
	const regexPattern = escapedPath.replace(/\\\{[^}]+\\\}/g, "[^/]+");
	return new RegExp(`^${regexPattern}$`);
}

/**
 * 実際のAPIパスにマッチするOpenAPIエンドポイントを検索する
 * パスパラメータ（{id}等）を考慮したパターンマッチングを行う
 * @param key - 検索対象のAPIキー（例: "GET /users/123"）
 * @param endpoints - OpenAPIエンドポイント一覧
 * @returns マッチしたエンドポイントキー、なければnull
 */
export function findMatchingEndpoint(
	key: string,
	endpoints: Map<string, Set<string>>,
): string | null {
	const { method, path } = parseEndpointKey(key);

	for (const endpointKey of endpoints.keys()) {
		const { method: endpointMethod, path: endpointPath } =
			parseEndpointKey(endpointKey);

		if (method !== endpointMethod) continue;

		const regex = createPathRegex(endpointPath);
		if (regex.test(path)) {
			return endpointKey;
		}
	}

	return null;
}
