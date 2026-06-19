# はじめよう

## スキーマの定義

### インストール

```bash
pnpm add @odoku-lab/settings
```

### スキーマ定義の書き方

`settings.ts` を作成し、`defineSettings` と `types as t` をインポートしてスキーマを定義します。
型名はすべて小文字（`t.string()`, `t.number()` など）です。

```typescript
import { defineSettings, type InferSettings, types as t } from "@odoku-lab/settings";

export const schema = {
  nodeEnv: t.string({
    options: ["development", "production", "test"] as const,
    default: "development",
  }),
  port: t.number({ default: 3000 }),
  databaseUrl: t.string(),
  logLevel: t.string({
    options: ["debug", "info", "warn", "error"] as const,
    default: "info",
  }),
};

export type Settings = InferSettings<typeof schema>;
export const settings = defineSettings(schema);
```

### 環境変数の読み取り元

デフォルトでは `process.env` から値を取得します。`source` オプションで任意のオブジェクトに差し替えることもできます（テスト時などに便利です）。

```typescript
// デフォルト: process.env から読む
const settings = defineSettings(schema);

// source を指定: 任意のオブジェクトから読む
const settings = defineSettings(schema, {
  source: { PORT: "8080", DATABASE_URL: "postgres://localhost/test" },
});
```

### changeCase による環境変数名の自動変換

`changeCase` オプションはデフォルトで `true` のため、スキーマキー（camelCase）は自動的に `UPPER_SNAKE_CASE` に変換されて環境変数名として解決されます。

| スキーマキー  | 環境変数名     |
| ------------- | -------------- |
| `nodeEnv`     | `NODE_ENV`     |
| `port`        | `PORT`         |
| `databaseUrl` | `DATABASE_URL` |
| `logLevel`    | `LOG_LEVEL`    |

---

## 値の取得方法（$value / $resolve）

### `$value()` — 同期取得（SyncAccessor）

通常の文字列・数値・真偽値などの同期フィールドは `$value()` で値を取得できます。
戻り値の型は `SyncAccessor<T>` です。

```typescript
import { settings } from "./settings";

console.log(settings.nodeEnv.$value());     // "production"
console.log(settings.port.$value());        // 8080
console.log(settings.databaseUrl.$value()); // "postgres://..."
```

### `$resolve()` — 非同期取得（AsyncAccessor）

`func`（非同期関数）、シークレット、`template`（非同期参照を含む）は非同期フィールドになります。
これらは `$resolve()` で値を取得します。戻り値の型は `AsyncAccessor<T>` です。

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  port: t.number({ default: 3000 }),
  apiKey: t.func(async () => {
    // 外部サービスや Vault などから動的に取得する例
    return fetchSecretFromVault("API_KEY");
  }),
});

// 非同期フィールドは $resolve() で取得する
const apiKey = await settings.apiKey.$resolve();
console.log(apiKey); // "sk-..."
```

### どちらを使うかの判断基準

| フィールドの種類                           | 取得方法     |
| ------------------------------------------ | ------------ |
| 通常の型（string / number / boolean など） | `$value()`   |
| `func`（同期関数）                         | `$value()`   |
| `func`（非同期関数）                       | `$resolve()` |
| `secret`                                   | `$resolve()` |
| `template`（同期フィールドのみ参照）       | `$value()`   |
| `template`（非同期フィールドを参照）       | `$resolve()` |

非同期フィールドに `$value()` を呼び出すとエラーがスローされます。
型システム上も `AsyncAccessor<T>` には `$value()` が存在しないため、TypeScript がコンパイル時に検出します。

---

## 次のステップ

- [スキーマ定義ガイド](/guides/defining-schema) — 型の詳細なオプションやグループ化
- [設定の読み込み](/guides/loading-settings) — `$load()` によるバリデーションと解決順序
- [シークレット管理](/guides/secrets) — AWS Secrets Manager・Vault などのシークレットバックエンド
- [エラーハンドリング](/guides/error-handling) — `SettingsValidationError` の処理方法
