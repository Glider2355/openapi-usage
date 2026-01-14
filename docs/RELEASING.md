# リリース手順

このドキュメントでは、リリースワークフローを説明します。

## ワークフロー

```
バージョン更新 → タグ作成 → ドラフトRelease自動作成 → Publish → npm公開
```

## 手順

### 1. バージョンを更新

`package.json` のバージョンを更新します:

```bash
# 例: 0.1.0 → 0.2.0
npm version minor --no-git-tag-version

# または手動で package.json を編集
```

### 2. コミット

```bash
git add package.json
git commit -m "chore: bump version to 0.2.0"
git push origin main
```

### 3. タグを作成

```bash
git tag v0.2.0
git push origin v0.2.0
```

タグをプッシュすると、GitHub Actions が **ドラフト Release** を自動作成します。

### 4. Release Notes を確認

1. GitHub の [Releases](../../releases) ページを開く
2. ドラフトリリースを確認
3. Release Notes を確認・編集（必要に応じて）

### 5. Publish

「Publish release」ボタンをクリックすると:

1. GitHub Release が公開
2. npm パッケージが自動公開

## バージョニング規則（Semantic Versioning）

| 変更タイプ | コマンド | 例 |
|-----------|----------|-----|
| 破壊的変更 | `npm version major` | 1.0.0 → 2.0.0 |
| 新機能追加 | `npm version minor` | 1.0.0 → 1.1.0 |
| バグ修正 | `npm version patch` | 1.0.0 → 1.0.1 |

## Git Tags

### タグの命名規則

```
v{major}.{minor}.{patch}
```

例: `v1.0.0`, `v1.2.3`, `v2.0.0-beta.1`

### タグの確認

```bash
# すべてのタグを表示
git tag

# 特定バージョンのコードをチェックアウト
git checkout v1.0.0
```

## GitHub Release Notes の自動生成

`.github/release.yml` により Release Notes が自動的にカテゴリ分けされます。

| ラベル | カテゴリ |
|--------|----------|
| `enhancement` | 🚀 New Features |
| `bug` | 🐛 Bug Fixes |
| `breaking-change` | ⚠️ Breaking Changes |
| `documentation` | 📚 Documentation |
| `dependencies` | 📦 Dependencies |

PRに適切なラベルを付けることで、Release Notes が自動的に整理されます。

## FAQ

### Q: リリースをやり直したい

1. GitHub Release を削除
2. タグを削除: `git push origin --delete v0.2.0 && git tag -d v0.2.0`
3. 修正後、再度タグを作成

### Q: Pre-release を作成したい

```bash
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1
```

ドラフトリリースで「Set as a pre-release」にチェックを入れてから Publish します。
