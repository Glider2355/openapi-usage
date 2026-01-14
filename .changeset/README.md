# Changesets

このフォルダはバージョン管理とCHANGELOG生成のための [changesets](https://github.com/changesets/changesets) によって管理されています。

## 使い方

変更を加えた後、以下のコマンドでchangesetを追加してください:

```bash
pnpm changeset
```

対話形式で以下を入力します:
1. バンプするパッケージを選択
2. バージョンの種類（major/minor/patch）を選択
3. 変更内容の概要を記述

## リリースワークフロー

1. `pnpm changeset` でchangesetを追加
2. PRを作成・マージ
3. GitHub Actionsが自動でリリースPRを作成
4. リリースPRをマージすると自動でnpm公開
