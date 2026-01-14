# GitHub Secrets 設定

このドキュメントでは、CI/CDパイプラインに必要な設定方法を説明します。

## Trusted Publishing（推奨）

このプロジェクトは **npm Trusted Publishing** を使用しています。トークン管理が不要で、より安全です。

### 設定手順

#### 1. 初回公開（手動）

初回のみ、2FAを使って手動で公開する必要があります：

```bash
npm publish --access public
# 2FAコードの入力を求められるので入力
```

#### 2. npmjs.comでTrusted Publisherを設定

1. [npmjs.com](https://www.npmjs.com) でパッケージページを開く
2. **Settings** タブをクリック
3. **Trusted Publisher** セクションを見つける
4. **GitHub Actions** を選択
5. 以下を入力：
   - **Organization or user**: `Glider2355`
   - **Repository**: `openapi-usage`
   - **Workflow filename**: `release.yml`
   - **Environment name**: 空欄

#### 3. 完了

以降は `release.yml` ワークフローから自動的に公開されます。NPM_TOKENの設定は不要です。

## 仕組み

Trusted Publishingは **OpenID Connect (OIDC)** を使用します：

1. GitHub Actionsが短命のOIDCトークンを生成
2. npmがトークンを検証し、設定されたリポジトリ/ワークフローからのリクエストか確認
3. 認証が成功すると公開が許可される

### メリット

- トークン漏洩のリスクがない
- トークンのローテーションが不要
- 自動的にProvenance（出所証明）が付与される

## トラブルシューティング

### "Unable to authenticate" エラー

1. **ワークフローファイル名を確認**: `release.yml` が正確か（大文字小文字も含めて）
2. **Organization名を確認**: GitHubのURLと完全一致しているか
3. **package.jsonのrepository.url**: GitHubのURLと一致しているか

### GitHub Actionsで失敗する場合

1. `id-token: write` 権限が設定されているか確認
2. GitHub-hostedランナーを使用しているか確認（self-hostedは未サポート）
3. npm CLI v11.5.1以上を使用しているか確認

## 参考リンク

- [npm Trusted Publishing ドキュメント](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Changelog: npm trusted publishing](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
