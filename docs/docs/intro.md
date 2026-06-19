# node-settings

**node-settings** は Node.js アプリケーション向けの型安全な環境変数設定ローダーです。
スキーマを1度定義するだけで、型推論・バリデーション・ランタイム操作を備えた設定オブジェクトを生成します。

## 特徴

- **型安全** — スキーマ定義から自動で TypeScript の型を推論
- **バリデーション** — 型・フォーマット・必須チェックを一括実行（`$load()` で起動時に全フィールドを検証）
- **遅延評価** — `$value()` / `$resolve()` を呼び出すまでフィールドは解決されない
- **ランタイム操作** — `$mutate()` / `$reset()` で実行時に設定を上書き・リセット
- **多彩な型** — 文字列・数値・真偽値・日付・URL・Duration・JSON・配列・定数・テンプレート・関数
- **グループ定義** — `t.object()` でフィールドをネスト構造にまとめられる
- **シークレット管理** — `t.secret()` で外部シークレットストア（AWS Secrets Manager など）と連携
- **セキュリティ** — `frozen` 設定で変更を禁止、シークレット値をエラーから自動マスク
- **changeCase** — スキーマキーを自動で `UPPER_SNAKE_CASE` に変換して環境変数を解決

## インストール

```bash
pnpm add @odoku-lab/settings
```

## クイックスタート

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const schema = {
  host: t.string({ default: "localhost" }),
  port: t.number({ default: 3000 }),
  dbUrl: t.url(),
};

const settings = defineSettings(schema);
// changeCase: true (デフォルト) により:
//   host   → process.env["HOST"]
//   port   → process.env["PORT"]
//   dbUrl  → process.env["DB_URL"]

// 各フィールドは SyncAccessor を返す
console.log(settings.host.$value());   // "localhost" or from env
console.log(settings.port.$value());   // 3000 or from env

// 起動時に全フィールドを一括検証（推奨）
await settings.$load();
```

## 次のステップ

- [はじめよう](/getting-started) — インストールから最初の設定まで
- [スキーマ定義ガイド](/guides/defining-schema) — スキーマの書き方
- [型一覧](/types/overview) — 利用可能な型のリファレンス
