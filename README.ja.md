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
  - pattern: "GET /temp/*"
    reason: "ローカル用静的ファイル配信"

# エンドポイントごとに呼び出しを許可するディレクトリ
locations:
  "* /users/**":
    - "src/hooks/api/user/**"
  "*":
    - "src/hooks/api/**"
```

### 設定オプション

| オプション | 説明 |
|------------|------|
| `openapi` | OpenAPI仕様ファイル(json)のパス |
| `src` | 解析対象ディレクトリ。単一パスまたはパスのリスト |
| `output` | JSON出力先パス。`--check` モードでは無視される |
| `level` | 重大度レベル: `error` または `warn`。起動時に検証される |
| `ignore` | 無視するエンドポイントのリスト。パターン文字列または `{ pattern, reason }` |
| `locations` | エンドポイントパターン → 呼び出しを許可するディレクトリglob |

設定ファイルはスキーマ検証されます。不正な値（例: `level: warning`）は黙って無視されず
終了コード1で終了し、未知のキーは警告として報告されます:

```
Error: Invalid config file /app/openapi-usage.yaml: level: invalid level "warning" (expected "error" or "warn")
Warning: unknown config key "levell" in /app/openapi-usage.yaml (ignored)
```

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

各エントリには理由を構造化して持たせられます。理由はレポートとJSON出力に含まれるため、
「なぜ未使用のまま残しているか」をYAMLコメントに閉じ込めずに済みます:

```yaml
ignore:
  - "GET /health"                  # 従来どおり文字列も可
  - pattern: "GET /temp/*"
    reason: "ローカル用静的ファイル配信"
```

どのエンドポイントにもマッチしないパターンは警告されます。エンドポイントの改名・削除で
ignoreが「死んだ」ことに気づけます:

```
warning: ignore pattern "GET /sounds/*" matched no endpoint
```

### 複数のソースディレクトリ

`--src` を複数回指定する、または `src` にリストを渡すと、同じ仕様に対して複数のクライアント
（frontend と e2e など）を解析できます。いずれかのディレクトリが呼んでいれば使用済みとして扱い、
サマリには「そのディレクトリから呼ばれていないエンドポイント数」も出力されます:

```yaml
src:
  - packages/frontend/src
  - e2e/api
```

```bash
openapi-usage --src packages/frontend/src --src e2e/api --check
```

```
───────────────────────────────────
Unused APIs: 1
  - DELETE /users/{id}
Unused APIs per source:
  packages/frontend/src: 2
  e2e/api: 9
```

レポートとJSON出力の呼び出し位置パスは、カレントディレクトリからの相対パスです。

### 呼び出し位置ルール

`locations` はエンドポイントパターンに対して、呼び出しを許可するディレクトリglobを指定します。
「APIフックは `src/hooks/api/` に集約し、ディレクトリはAPIパスの構造に合わせる」といったルールを
機械で検査できます。許可ディレクトリ外からの呼び出しは違反として報告され、`level: error` の
`--check` では終了コード1になります:

```yaml
locations:
  # endpointパターン → 呼び出しを許可するディレクトリglob
  "* /novel/**":
    - "src/hooks/api/novel/**"
    - "src/app/**/_lib/**"        # SSRのデータ取得
  "* /user/**":
    - "src/hooks/api/user/**"
  "*":                            # 既定
    - "src/hooks/api/**"
```

```
───────────────────────────────────
Location violations: 1
  - GET /novel/{novel_id} at src/components/NovelCard.tsx:12
    allowed: src/hooks/api/novel/**, src/app/**/_lib/** (rule: "* /novel/**")
```

- ディレクトリglobでは `**` はディレクトリ境界を越え、`*` は越えません
- ワイルドカードを含まないglob（または `/` で終わるglob）はディレクトリとして扱い、配下の全ファイルを
  許可します。`src/hooks/api` は `src/hooks/api/**` と同じ意味になります
- 複数のエンドポイントパターンがマッチする場合は、最も具体的なもの（ワイルドカードを除いた
  文字数が多いもの）が適用されるため、`"*"` は既定値として機能します
- globはカレントディレクトリからの相対パスと照合されます
- `ignore` はこのルールを免除しません（ignoreは未使用APIの報告のみを制御します）

## CLI オプション

```bash
openapi-usage [options]

オプション:
  -o, --openapi <path>  OpenAPI仕様ファイル(json)のパス
  -s, --src <path>      解析対象ディレクトリ（複数回指定可）
  --output <path>       JSON出力先パス
  --check               チェックモード（未使用があればexit 1、--level errorの場合）
  --level <level>       未使用APIの重大度レベル: "error" または "warn"（デフォルト: "error"）
  -c, --config <path>   設定ファイル(YAML)のパス
```

CLIオプションは設定ファイルの設定を上書きします。

`--check` モードでは設定ファイルの `output` は書き込まれません。lintタスクからチェックを
呼んでもファイルを書き換えないためです。`--check` でもJSONを書きたい場合は `--output` を
明示的に指定してください。

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

`locations` を設定している場合は、サマリーの後に違反が出力されます。違反はJSON出力ファイルを
書き込む場合を含め、すべてのモードで表示されます:

```
───────────────────────────────────
Location violations: 1
  - GET /users at src/api.ts:4
    allowed: src/hooks/api/** (rule: "*")
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
    },
    {
      "method": "GET",
      "path": "/temp/{id}",
      "usages": [],
      "ignored": true,
      "reason": "ローカル用静的ファイル配信"
    }
  ],
  "summary": {
    "total": 50,
    "used": 48,
    "unused": 1,
    "ignored": 1
  }
}
```

ignoreされたエンドポイントも `ignored: true`（ignoreエントリに理由があれば `reason` 付き）で
出力に含まれ、`summary.unused` ではなく `summary.ignored` にカウントされます
（`used + unused + ignored === total`）。ignoreされていても `usages` は実際の呼び出し箇所を
そのまま出力するので、実際には使われているエンドポイントへのignoreに気づけます。

## 終了コード

| コード | 意味 |
|--------|------|
| 0 | 未使用 API・位置ルール違反なし（または `--level warn`） |
| 1 | 未使用 API または位置ルール違反あり（`--level error` の場合） |
| 1 | 設定が不正（未知の `level`、型不一致、パス不存在など） |

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

// TypeScriptファイルを解析（srcPathsで複数ディレクトリを指定可）
const usages = analyzeTypeScriptFiles(endpoints, { srcPaths: ["./src"] });

// JSON出力を生成
const output = generateJsonOutput(usages);
console.log(JSON.stringify(output, null, 2));
```

## ライセンス

MIT
