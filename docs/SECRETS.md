# GitHub Secrets 設定

このドキュメントでは、CI/CDパイプラインに必要なGitHub Secretsの設定方法を説明します。

## 必要なシークレット

| シークレット名 | 用途 | 必須 |
|---------------|------|------|
| `NPM_TOKEN` | npm公開用トークン | 必須 |

> `GITHUB_TOKEN` は自動的に提供されるため、手動設定は不要です。

## NPM_TOKEN の設定

### 1. npmでアクセストークンを作成

1. [npmjs.com](https://www.npmjs.com) にログイン
2. 右上のアバター → **Access Tokens** をクリック
3. **Generate New Token** → **Classic Token** を選択
4. トークン名を入力（例: `github-actions-openapi-usage`）
5. タイプを **Automation** に設定
   - Automation: 2FAをバイパスして公開可能（CI/CD向け）
6. **Generate Token** をクリック
7. 表示されたトークンをコピー（一度しか表示されません）

### 2. GitHubリポジトリにシークレットを追加

1. GitHubリポジトリの **Settings** を開く
2. 左メニューから **Secrets and variables** → **Actions** を選択
3. **New repository secret** をクリック
4. 以下を入力:
   - **Name**: `NPM_TOKEN`
   - **Secret**: コピーしたnpmトークン
5. **Add secret** をクリック

## 確認方法

シークレットが正しく設定されているか確認するには:

1. テスト用のPRを作成
2. GitHub Actionsのログを確認
3. リリースワークフローが正常に動作するか確認

## セキュリティ注意事項

### トークンの管理

- トークンは定期的にローテーション（更新）してください
- 漏洩した場合は即座にnpmで無効化してください
- 最小限の権限（Automation）のみを付与してください

### リポジトリの設定

- フォークからのPRでシークレットは利用不可（デフォルトで安全）
- ブランチ保護ルールを設定し、mainへの直接プッシュを防止
- 必要に応じて**Environments**で追加の保護を設定

## トラブルシューティング

### "npm ERR! 401 Unauthorized"

- トークンが無効または期限切れ
- トークンを再生成してシークレットを更新

### "npm ERR! 403 Forbidden"

- トークンの権限が不足
- Automationタイプのトークンを使用しているか確認

### "npm ERR! 402 Payment Required"

- プライベートパッケージを公開しようとしている
- `package.json` の `private` フィールドを削除
- または有料プランへアップグレード
