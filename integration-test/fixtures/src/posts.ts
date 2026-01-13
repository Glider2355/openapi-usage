import { createClient } from "openapi-fetch";
import type { paths } from "./schema";

const client = createClient<paths>();

export async function getPosts() {
	return client.GET("/posts");
}

export async function createPost(data: unknown) {
	return client.POST("/posts");
}

// 動的パスパラメータのテスト
export async function getUserPost(userId: string, postId: string) {
	return client.GET("/users/{userId}/posts/{postId}");
}
