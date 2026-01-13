import { describe, expect, it } from "vitest";
import { findMatchingEndpoint } from "./path-matcher.js";

describe("findMatchingEndpoint", () => {
	it("完全一致するエンドポイントを見つける", () => {
		const endpoints = new Map([
			["GET /users", new Set<string>()],
			["POST /users", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users", endpoints)).toBe("GET /users");
		expect(findMatchingEndpoint("POST /users", endpoints)).toBe("POST /users");
	});

	it("パスパラメータを含むエンドポイントにマッチする", () => {
		const endpoints = new Map([
			["GET /users/{id}", new Set<string>()],
			["DELETE /users/{id}/posts/{postId}", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users/123", endpoints)).toBe(
			"GET /users/{id}",
		);
		expect(findMatchingEndpoint("DELETE /users/123/posts/456", endpoints)).toBe(
			"DELETE /users/{id}/posts/{postId}",
		);
	});

	it("メソッドが一致しない場合はnullを返す", () => {
		const endpoints = new Map([["GET /users", new Set<string>()]]);

		expect(findMatchingEndpoint("POST /users", endpoints)).toBe(null);
	});

	it("パスが一致しない場合はnullを返す", () => {
		const endpoints = new Map([["GET /users", new Set<string>()]]);

		expect(findMatchingEndpoint("GET /posts", endpoints)).toBe(null);
	});

	it("特殊文字を含むパスを正しくエスケープする", () => {
		const endpoints = new Map([
			["GET /api/v1.0/users/{id}", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /api/v1.0/users/123", endpoints)).toBe(
			"GET /api/v1.0/users/{id}",
		);
		expect(findMatchingEndpoint("GET /api/v1X0/users/123", endpoints)).toBe(
			null,
		);
	});

	it("複数のエンドポイントから正しいものを選択する", () => {
		const endpoints = new Map([
			["GET /users", new Set<string>()],
			["GET /users/{id}", new Set<string>()],
			["GET /users/{id}/posts", new Set<string>()],
		]);

		expect(findMatchingEndpoint("GET /users", endpoints)).toBe("GET /users");
		expect(findMatchingEndpoint("GET /users/123", endpoints)).toBe(
			"GET /users/{id}",
		);
		expect(findMatchingEndpoint("GET /users/123/posts", endpoints)).toBe(
			"GET /users/{id}/posts",
		);
	});
});
