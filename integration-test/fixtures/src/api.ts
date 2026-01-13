import { createClient } from "openapi-fetch";
import type { paths } from "./schema";

const client = createClient<paths>();

// 使用されているAPI
export async function getUsers() {
	return client.GET("/users");
}

export async function createUser(data: unknown) {
	return client.POST("/users");
}

export async function getUser(id: string) {
	return client.GET("/users/{id}");
}

// 三項演算子のテスト
export async function fetchData(isAdmin: boolean) {
	return client.GET(isAdmin ? "/users" : "/posts");
}
