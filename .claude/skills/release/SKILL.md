---
name: release
description: バージョン管理から npm publish、GitHub Release 作成までを自動化するリリース手順。バージョンタグのプッシュをトリガーに CI が検証・公開・リリースノート生成を実行する。
---

# リリース手順

## リリースの流れ

```bash
# 1. リリースバージョンを決定
npm version patch   # 0.1.0 → 0.1.1 (bug fixes)
npm version minor   # 0.1.0 → 0.2.0 (new features, backward compatible)
npm version major   # 0.1.0 → 1.0.0 (breaking changes)

# 2. GitHub にプッシュ
git push --follow-tags
```

以降は CI (`.github/workflows/publish.yml`) が自動実行:
1. タグバージョン (`v0.1.1`) と `package.json` のバージョン (`0.1.1`) の一致を検証
2. lint, typecheck, test, build を実行
3. npm publish (`@odoku-lab/settings`)
4. GitHub Release を作成（自動生成リリースノート付き）

## バージョニングルール

| コマンド            | 用途                 | 例                |
| ------------------- | -------------------- | ----------------- |
| `npm version patch` | バグ修正             | `0.1.0` → `0.1.1` |
| `npm version minor` | 互換性のある機能追加 | `0.1.0` → `0.2.0` |
| `npm version major` | 互換性のない変更     | `0.1.0` → `1.0.0` |

## 事前準備

### npm 側で Trusted Publishing（OIDC）を設定

1. npm サイトで `@odoku-lab` org または `@odoku-lab/settings` パッケージにアクセス
2. **Access → Integrations → Add new integration → GitHub** を選択
3. リポジトリ `odoku-lab/node-settings` を入力
4. 希望する環境（例: `master` ブランチ, `v*` タグ）を設定

初回発行時のみ通常の token 認証が必要になる場合がある。その場合は一度 `npm publish --access public` で公開後、上記の OIDC 設定を行い、次回以降は `--provenance` で公開する。

## リリースノートについて

GitHub の自動生成機能を使用。PR タイトルがそのまま反映されるため、Conventional Commits 形式 (`feat:`, `fix:`, `chore:` など) で PR を作成すると見やすいリリースノートになる。

カスタマイズしたい場合は `.github/release.yml` を作成してラベルごとの分類ルールを設定可能。

## CI ワークフロー

`.github/workflows/publish.yml` が `v*` タグのプッシュをトリガーに:
- `actions/checkout@v4`
- バージョン一致検証
- `pnpm install --frozen-lockfile`
- `pnpm run lint` / `typecheck` / `test` / `build`
- `pnpm publish --no-git-checks --provenance`（Trusted Publishing / OIDC）
- `softprops/action-gh-release@v2` で Release 作成 (`generate_release_notes: true`)
