// openapi-typescriptで生成される型のスタブ
export interface paths {
	"/users": {
		get: {
			responses: {
				200: { content: { "application/json": unknown[] } };
			};
		};
		post: {
			requestBody: { content: { "application/json": unknown } };
			responses: {
				201: { content: { "application/json": unknown } };
			};
		};
	};
	"/users/{id}": {
		get: {
			parameters: { path: { id: string } };
			responses: {
				200: { content: { "application/json": unknown } };
			};
		};
		put: {
			parameters: { path: { id: string } };
			requestBody: { content: { "application/json": unknown } };
			responses: {
				200: { content: { "application/json": unknown } };
			};
		};
		delete: {
			parameters: { path: { id: string } };
			responses: {
				204: { content: never };
			};
		};
	};
	"/posts": {
		get: {
			responses: {
				200: { content: { "application/json": unknown[] } };
			};
		};
		post: {
			requestBody: { content: { "application/json": unknown } };
			responses: {
				201: { content: { "application/json": unknown } };
			};
		};
	};
	"/posts/{id}": {
		get: {
			parameters: { path: { id: string } };
			responses: {
				200: { content: { "application/json": unknown } };
			};
		};
		delete: {
			parameters: { path: { id: string } };
			responses: {
				204: { content: never };
			};
		};
	};
	"/users/{userId}/posts/{postId}": {
		get: {
			parameters: { path: { userId: string; postId: string } };
			responses: {
				200: { content: { "application/json": unknown } };
			};
		};
	};
}
