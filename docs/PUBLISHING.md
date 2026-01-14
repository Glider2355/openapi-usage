# npm公開手順

このドキュメントでは、`openapi-usage` パッケージをnpmに公開するための初期設定と手順を説明します。

## 前提条件

- npmアカウントを持っていること
- リポジトリへの書き込み権限があること
- GitHub Secretsの設定が完了していること（[SECRETS.md](./SECRETS.md) 参照）

## 初期設定（初回のみ）

### 1. npmアカウントの準備

```bash
# npmにログイン（未ログインの場合）
npm login

# ログイン確認
npm whoami
```

### 2. パッケージ名の確認

パッケージ名 `openapi-usage` がnpmで利用可能か確認します:

```bash
npm view openapi-usage
```

既に使用されている場合は、`package.json` の `name` を変更してください（例: `@your-scope/openapi-usage`）。

### 3. changesets CLIのインストール確認

```bash
pnpm install
pnpm changeset --version
```

### 4. 初回リリース

初回は手動でリリースを行うことを推奨します:

```bash
# ビルド
pnpm build

# パッケージの内容確認
npm pack --dry-run

# 公開（初回）
npm publish --access public
```

## 日常的なリリースワークフロー

日常的なリリースは [RELEASING.md](./RELEASING.md) を参照してください。

## トラブルシューティング

### パッケージ名が既に使用されている

```bash
# スコープ付きパッケージに変更
# package.json の name を "@your-scope/openapi-usage" に変更
npm publish --access public
```

### 2FA が有効な場合

npm 2FAが有効な場合、`NPM_TOKEN` は Automation token である必要があります。
[npm 公式ドキュメント](https://docs.npmjs.com/creating-and-viewing-access-tokens) を参照してください。

### GitHub Actions でのエラー

1. `NPM_TOKEN` が正しく設定されているか確認
2. トークンの有効期限を確認
3. トークンの権限（Automation）を確認
