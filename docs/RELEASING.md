# リリース手順

このドキュメントでは、日常的なリリースワークフローを説明します。

## 概要

このプロジェクトは [Changesets](https://github.com/changesets/changesets) を使用してバージョン管理とリリースを行います。

## ワークフロー

```
機能開発 → changeset追加 → PR作成 → マージ → リリースPR自動作成 → マージ → npm公開
```

## 手順

### 1. 変更を加える

通常通りブランチを作成し、コードを変更します:

```bash
git checkout -b feature/my-feature
# コードを変更...
```

### 2. changesetを追加

変更が完了したら、changesetを追加します:

```bash
pnpm changeset
```

対話形式で以下を入力します:

1. **Which packages would you like to include?**
   - `openapi-usage` を選択（スペースキー）してEnter

2. **Which packages should have a major bump?**
   - 破壊的変更がある場合のみ選択

3. **Which packages should have a minor bump?**
   - 新機能追加の場合に選択

4. **Summary**
   - 変更内容の概要を記述（日本語可）

### 3. PRを作成

```bash
git add .
git commit -m "feat: add my feature"
git push origin feature/my-feature
```

GitHubでPRを作成します。

### 4. PRレビュー・マージ

- changesetファイル（`.changeset/*.md`）もレビュー対象です
- 変更内容がCHANGELOGに反映されることを確認

### 5. リリースPRの確認

mainブランチにマージされると、GitHub Actionsが自動でリリースPRを作成します:

- PR名: `chore: release packages`
- 内容: バージョン更新 + CHANGELOG更新

### 6. リリースPRをマージ

リリースPRをマージすると:

1. npmパッケージが自動公開
2. GitHub Releaseが自動作成
3. CHANGELOG.mdが更新

## バージョニング規則（Semantic Versioning）

| 変更タイプ | バージョン | 例 |
|-----------|-----------|-----|
| 破壊的変更（BREAKING CHANGE） | Major | 1.0.0 → 2.0.0 |
| 新機能追加 | Minor | 1.0.0 → 1.1.0 |
| バグ修正 | Patch | 1.0.0 → 1.0.1 |

### 破壊的変更の例

- 公開APIの削除・変更
- 必須オプションの追加
- 出力形式の変更
- Node.jsバージョン要件の変更

### 新機能の例

- 新しいCLIオプション追加
- 新しいエクスポート関数追加
- 新しい出力形式のサポート

### バグ修正の例

- 既存機能のバグ修正
- ドキュメント修正
- パフォーマンス改善

## 手動リリース（緊急時）

自動化が失敗した場合の手動リリース:

```bash
# mainブランチを最新に
git checkout main
git pull

# バージョン更新
pnpm changeset version

# コミット
git add .
git commit -m "chore: release"
git push

# ビルド＆公開
pnpm build
npm publish
```

## FAQ

### Q: changesetを追加し忘れた

PRをマージした後でも、別のPRでchangesetを追加できます。

### Q: 複数の変更を1つのchangesetにまとめたい

`pnpm changeset` を複数回実行すると、それぞれ別のchangesetファイルが作成されます。
1つにまとめたい場合は、`.changeset/` 内のmdファイルを手動で編集してください。

### Q: リリースをスキップしたい

リリースPRをクローズ（マージせずに閉じる）してください。
次のchangesetがマージされると、新しいリリースPRが作成されます。
