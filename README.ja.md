# @odoku-lab/settings

[![CI](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Node.js と TypeScript のための型安全な設定ローダー。環境変数・定数・テンプレートを 1 つのスキーマ定義から読み込み、型推論された設定オブジェクトを返します。

## インストール

```bash
npm install @odoku-lab/settings
# または
pnpm add @odoku-lab/settings
```

Zod または valibot と組み合わせて使う場合は、それぞれ追加でインストールしてください。

```bash
npm install zod
npm install valibot
```

## 特徴

- **型安全** — スキーマ定義から戻り値の型を自動推論
- **エラー集約** — 最初のエラーで停止せず、全フィールドを検証してまとめて報告
- **テンプレート** — 他フィールドの解決済み値を `{KEY}` 形式で参照
- **ネストグループ** — 設定を階層化して整理
- **副作用なし** — `envFile` 指定時も `process.env` を汚染しません
- **Zod / valibot 対応** — 任意のスキーマバリデーションライブラリを組み込めます

## 基本的な使い方

```typescript
import { fields, loadSettings } from "@odoku-lab/settings"

const settings = loadSettings({
  DEBUG:   fields.Boolean({ default: false }),
  PORT:    fields.Number({ default: 3000 }),
  API_URL: fields.String(),                          // 必須
  WEBHOOK: fields.String({ optional: true }),        // 任意 → string | undefined
}, {
  prefix:  "APP_",   // APP_DEBUG, APP_PORT ... を参照
  envFile: ".env",   // 省略可。指定時のみ .env を読み込む
})

settings.DEBUG    // boolean
settings.PORT     // number
settings.API_URL  // string
settings.WEBHOOK  // string | undefined
```

## フィールドファクトリ

すべてのフィールドは `import { fields } from "@odoku-lab/settings"` からインポートします。

### fields.String

```typescript
fields.String()                                       // 必須, string
fields.String({ default: "localhost" })               // デフォルト値あり
fields.String({ optional: true })                     // 任意, string | undefined
fields.String({ key: "DB_HOST" })                     // キー名を上書き
fields.String({ regex: /^[a-z0-9]+$/ })              // 正規表現バリデーション
fields.String({ options: ["dev", "prod"] as const })  // 許容値の列挙 → "dev" | "prod"
```

### fields.Number

```typescript
fields.Number()                                       // 必須, number
fields.Number({ default: 3000 })                      // デフォルト値あり
fields.Number({ options: [80, 443, 8080] as const })  // 許容値の列挙 → 80 | 443 | 8080
```

### fields.Boolean

比較は大文字小文字を区別しません（`"TRUE"`, `"True"` なども認識されます）。

```typescript
fields.Boolean()                                          // 必須, boolean
fields.Boolean({ default: false })                        // デフォルト値あり
fields.Boolean({ trueValues: ["on", "enabled"] })         // 真とみなす文字列（デフォルト: "true", "1", "yes"）
fields.Boolean({ falseValues: ["off", "disabled"] })      // 偽とみなす文字列（デフォルト: "false", "0", "no"）
fields.Boolean({ allowUnrecognized: false })              // true/false どちらにも該当しない値をエラーにする
```

### fields.Date

```typescript
fields.Date()                                         // ISO 8601 文字列をパース → Date
fields.Date({ format: "yyyy-MM-dd" })                 // date-fns フォーマットでパース
```

### fields.Array

```typescript
fields.Array()                                        // カンマ区切り文字列 → string[]
fields.Array({ type: fields.Number() })                    // 要素ごとに変換 → number[]
fields.Array({ type: fields.String(), delimiter: "|" })    // デリミタを変更
fields.Array({ default: [] })                         // デフォルト値あり
```

空文字列の環境変数（`TAGS=""`）は空配列 `[]` として扱われます。

### fields.Json

```typescript
fields.Json()                                         // JSON.parse → unknown
fields.Json<{ port: number }>()                       // 型パラメータで型を絞り込み
```

### fields.ZodSchema

Zod スキーマを直接使います。デフォルト値は Zod 側の `.default()` で設定してください。環境変数が未設定のときに `undefined` を返したい場合は `optional: true` を指定します。

```typescript
import { z } from "zod"
import { fields } from "@odoku-lab/settings"

fields.ZodSchema({ schema: z.coerce.number().int().min(1).max(65535) })
fields.ZodSchema({ schema: z.coerce.number().default(3000) })
fields.ZodSchema({ schema: z.string().email() })
fields.ZodSchema({ schema: z.string(), optional: true })  // 未設定なら undefined
```

### fields.ValibotSchema

valibot スキーマを直接使います。Standard Schema v1 に準拠していれば動作します。環境変数が未設定のときに `undefined` を返したい場合は `optional: true` を指定します。

```typescript
import * as v from "valibot"
import { fields } from "@odoku-lab/settings"

fields.ValibotSchema({ schema: v.pipe(v.string(), v.transform(Number), v.number()) })
fields.ValibotSchema({ schema: v.fallback(v.pipe(v.string(), v.transform(Number), v.number()), 3000) })
fields.ValibotSchema({ schema: v.string(), optional: true })  // 未設定なら undefined
```

### fields.Template

`{KEY}` / `{GROUP.KEY}` 形式で他フィールドの解決済み値を参照します。

```typescript
fields.Template("postgresql://{HOST}:{PORT}/mydb")
fields.Template("https://{DATABASE.HOST}:{DATABASE.PORT}/api")
```

## 共通オプション

ほとんどのフィールドファクトリは以下のオプションを受け付けます。

| オプション              | 説明                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `key`                   | 参照する環境変数キー名。省略時はスキーマのフィールド名 + prefix   |
| `key: { name, prefix }` | prefix を個別に上書きする場合はオブジェクト形式で指定             |
| `default`               | 環境変数が未設定の場合に使うデフォルト値                          |
| `optional: true`        | 未設定でも `undefined` を返す（エラーになりません）               |

## 定数フィールド

環境変数を参照せず、値をそのまま返します。プリミティブ・Date・配列・オブジェクトのどれでも使えます。

```typescript
const s = loadSettings({
  SECRET: "my-secret",          // 型: "my-secret"
  VERSION: 2,                   // 型: 2
  FLAG: true,                   // 型: true
  TAGS: ["a", "b"] as const,   // 型: readonly ["a", "b"]
  TODAY: new Date(),            // 型: Date
  META: { host: "localhost" },  // 型: { host: string }（そのまま返す）
})
```

## ネストグループ

`fields.*` フィールドを含むオブジェクトはグループとして再帰的に解決されます。

```typescript
const s = loadSettings({
  DATABASE: {
    HOST: fields.String({ key: { name: "DB_HOST", prefix: "" } }),
    PORT: fields.Number({ key: { name: "DB_PORT", prefix: "" } }),
    URL:  fields.Template("postgresql://{DATABASE.HOST}:{DATABASE.PORT}/mydb"),
  },
})

s.DATABASE.HOST  // string
s.DATABASE.PORT  // number
s.DATABASE.URL   // "postgresql://pg.example.com:5432/mydb"
```

## prefix とキーの上書き

`prefix` はすべての環境変数キーに前置されます。特定フィールドだけ別の prefix にしたい場合は `key` をオブジェクトで指定します。

```typescript
loadSettings({
  PORT: fields.Number(),                                          // → APP_PORT
  HOST: fields.String({ key: { name: "DB_HOST", prefix: "" } }), // → DB_HOST（prefix を無視）
}, { prefix: "APP_" })
```

## エラーハンドリング

`loadSettings` は全フィールドを検証してから、単一の `SettingsValidationError` にまとめてスローします。

```typescript
import {
  loadSettings,
  SettingsValidationError,
  MissingEnvError,
  InvalidValueError,
} from "@odoku-lab/settings"

try {
  const s = loadSettings({ /* ... */ })
} catch (e) {
  if (e instanceof SettingsValidationError) {
    for (const err of e.errors) {
      if (err instanceof MissingEnvError)   console.error("未設定:", err.fieldName)
      if (err instanceof InvalidValueError) console.error("不正な値:", err.fieldName)
    }
  }
}
```

| エラークラス              | 発生条件                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `SettingsError`           | 全エラーの基底クラス                                             |
| `MissingEnvError`         | 必須の環境変数が未設定                                           |
| `InvalidValueError`       | 型変換またはバリデーションに失敗                                 |
| `SchemaDefinitionError`   | スキーマ定義の誤り（テンプレート参照先なし、async スキーマなど） |
| `SettingsValidationError` | 1 つ以上のフィールド検証が失敗（個別エラーは `.errors` に格納）  |

## 注意点

- **空文字列の環境変数** — `APP_PORT=""` のように空文字列が設定されている場合、「値あり」とみなされ `default` は使われません。`number` など変換が必要な型では `InvalidValueError` になります。例外として `fields.Array` は空文字列を空配列 `[]` として扱います。
- **`envFile` と `process.env`** — `envFile` の内容はローカルにのみ読み込まれ、`process.env` を変更しません。既存の `process.env` の値が `envFile` より優先されます。
- **テンプレートとエラー集約** — テンプレートが参照するフィールドの解決に失敗した場合（`MissingEnvError` など）、そのテンプレートはスキップされます。Pass 1 のエラーが解消されれば Pass 2 のテンプレートも正常に評価されます。
