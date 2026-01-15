# openapi-usage

[English](./README.md)

OpenAPI 仕様を正として、フロントエンドの API 呼び出しを静的解析し、**呼び出し元の可視化**と**未使用 API の検知**を行うツール。

## インストール

```bash
npm install openapi-usage
# or
pnpm add openapi-usage
# or
yarn add openapi-usage
```

グローバルインストール（CLIとして使用）:

```bash
npm install -g openapi-usage
```

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

## 設定ファイル

YAML形式の設定ファイルで openapi-usage を設定できます。以下のファイル名は自動的に検出されます:

- `openapi-usage.yaml`
- `openapi-usage.yml`
- `.openapi-usage.yaml`
- `.openapi-usage.yml`

### 設定例

```yaml
# openapi-usage.yaml
openapi: ./openapi.json
src: ./src
output: ./api-usage.json
level: error

# 特定のエンドポイントを無視
ignore:
  - "GET /health"
  - "GET /metrics"
  - "* /internal/*"  # ワイルドカードパターン
```

### 設定オプション

| オプション | 説明 |
|------------|------|
| `openapi` | OpenAPI仕様ファイル(json)のパス |
| `src` | 解析対象ディレクトリ |
| `output` | JSON出力先パス |
| `level` | 重大度レベル: `error` または `warn` |
| `ignore` | 無視するエンドポイントのリスト（ワイルドカード対応） |

### ignoreパターン

`ignore` オプションは完全一致とワイルドカードパターンをサポートします:

```yaml
ignore:
  # 完全一致
  - "GET /health"
  - "POST /internal/webhook"

  # ワイルドカードパターン
  - "* /internal/*"      # /internal/ 配下のすべてのメソッド
  - "GET /admin/*"       # /admin/ 配下のすべてのGETリクエスト
  - "* /v1/deprecated/*" # 非推奨のv1エンドポイントすべて
```

## CLI オプション

```bash
openapi-usage [options]

オプション:
  -o, --openapi <path>  OpenAPI仕様ファイル(json)のパス
  -s, --src <path>      解析対象ディレクトリ
  --output <path>       JSON出力先パス
  --check               チェックモード（未使用があればexit 1、--level errorの場合）
  --level <level>       未使用APIの重大度レベル: "error" または "warn"（デフォルト: "error"）
  -c, --config <path>   設定ファイル(YAML)のパス
```

CLIオプションは設定ファイルの設定を上書きします。

### 重大度レベル

`--level` オプションは未使用APIが検出されたときの動作を制御します:

- `--level error`（デフォルト）: 未使用APIが見つかった場合、終了コード1で終了
- `--level warn`: 終了コード0で終了し、警告のみ表示

## 出力形式

### チェックモード（--check）

```
───────────────────────────────────
Unused APIs: 1
  - DELETE /users/{id}
```

### JSON出力（--output モード）

```json
{
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
| 0 | 未使用 API なし（または `--level warn`） |
| 1 | 未使用 API あり（`--level error` の場合） |

## ライブラリとして使用

```typescript
import {
  loadOpenAPISpec,
  parseOpenAPISpec,
  analyzeTypeScriptFiles,
  generateJsonOutput,
} from "openapi-usage";

// OpenAPI仕様を読み込み
const specResult = loadOpenAPISpec("./openapi.json");
if (!specResult.success) {
  console.error(specResult.error);
  process.exit(1);
}

// エンドポイント一覧を抽出
const endpoints = parseOpenAPISpec(specResult.spec);

// TypeScriptファイルを解析
const usages = analyzeTypeScriptFiles(endpoints, { srcPath: "./src" });

// JSON出力を生成
const output = generateJsonOutput(usages);
console.log(JSON.stringify(output, null, 2));
```

## ライセンス

MIT
