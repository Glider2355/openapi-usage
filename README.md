# openapi-usage

OpenAPI 仕様を正として、フロントエンドの API 呼び出しを静的解析し、**呼び出し元の可視化**と**未使用 API の検知**を行うツール。

## 前提条件

- `openapi-typescript` + `openapi-fetch` を使用したAPIクライアント
- `createClient()` で作成されたクライアント（変数名は自動検出）
- 動的パス生成なし（文字列リテラルのみ）

## 検知パターン

### 検知できる

```typescript
// 文字列リテラル
client.GET("/users");

// createClient で作成した任意の変数名
const api = createClient<paths>();
api.GET("/users");

// 三項演算子
client.GET(isAdmin ? "/admins" : "/users");

// 単純な変数参照
const path = "/users";
client.GET(path);

// パスパラメータ（推奨パターン）
client.GET("/users/{id}", { params: { path: { id: userId } } });
```

### 検知できない

```typescript
// テンプレートリテラル（型安全性も失われるため非推奨）
client.GET(`/users/${id}`);

// 関数の戻り値
const path = getPath();
client.GET(path);

// 文字列結合
client.GET("/users" + "/" + id);

// 動的に構築されたパス
const base = "/users";
client.GET(`${base}/${id}`);
```

> **Note:** 検知できないパターンは `openapi-fetch` の型安全性も失われます。
> パスパラメータは `params.path` で渡す方法を推奨します。

## 使い方

### 依存関係JSONの生成

```bash
pnpm --filter openapi-usage start
```

`docs/openapi/api-dependencies.json` に依存関係が出力されます。

### 未使用API検知（CIチェック用）

```bash
pnpm --filter openapi-usage check
```

未使用APIがあれば exit 1 で終了します。

### ルートからの実行

```bash
# OpenAPI仕様取得 + 依存関係生成
pnpm run gen:openapi      # サーバー起動中に実行
pnpm run gen:dependencies

# 未使用APIチェック
pnpm run lint:api
```

## CLI オプション

```bash
openapi-usage --openapi <path> --src <path> [options]

必須:
  -o, --openapi <path>  OpenAPI仕様ファイルのパス
  -s, --src <path>      解析対象ディレクトリ

オプション:
  --output <path>       JSON出力先パス
  --check               チェックモード（未使用があればexit 1）
```

## 出力形式

### ツリー表示（--check モード）

```
GET /users
├─ src/pages/Users.tsx:42
└─ src/hooks/useUsers.ts:18

DELETE /users/{id}
└─ (未使用)

───────────────────────────────────
未使用 API: 1件
  - DELETE /users/{id}
```

### JSON出力（--output モード）

```json
{
  "generated_at": "2026-01-13T10:00:00Z",
  "endpoints": [
    {
      "method": "GET",
      "path": "/users",
      "usages": [
        { "file": "src/pages/Users.tsx", "line": 42 }
      ]
    }
  ],
  "summary": {
    "total": 50,
    "used": 49,
    "unused": 1
  }
}
```

## 終了コード

| コード | 意味 |
|--------|------|
| 0 | 未使用 API なし |
| 1 | 未使用 API あり |
