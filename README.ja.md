# @odoku-lab/settings

[![CI](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Node.js と TypeScript のための型安全な環境変数 / 設定ローダー。スキーマを一度定義するだけで、完全な型推論付きの遅延評価設定オブジェクトを返します。

- **遅延評価** — すべてのフィールドは `$value()` / `$resolve()` によりオンデマンドで解決
- **シークレット管理** — AWS・Azure・GCP・HashiCorp Vault 対応のアダプターと TTL キャッシュを内蔵
- **ネストグループ** — `t.object()` で関連する設定をまとめて管理
- **ミューテーション & リセット** — `process.env` に触れずにランタイムで値を上書き
- **スキーマバリデーション** — Zod または Valibot を接続可能
- **変更追跡** — `$onChange()` で値の変化を購読

## インストール

```bash
npm install @odoku-lab/settings
```

## クイックスタート

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  PORT:     t.number({ default: 3000 }),
  HOST:     t.string({ default: "localhost" }),
  DEBUG:    t.boolean({ default: false }),
  BASE_URL: t.template("http://{HOST}:{PORT}"),
});

// 同期フィールドは $value() でアクセス
console.log(settings.PORT.$value());   // 3000
console.log(settings.DEBUG.$value());  // false

// 非同期フィールドは $resolve() でアクセス
console.log(await settings.BASE_URL.$resolve()); // "http://localhost:3000"
```

## API リファレンス

### `defineSettings(schema, options?)`

スキーマオブジェクトから型安全な設定プロキシを生成します。

```typescript
const settings = defineSettings(schema, {
  prefix:      "APP_",   // すべての環境変数キーに付けるプレフィックス (デフォルト: "")
  source:      {},       // process.env の代わりに使うカスタムオブジェクト
  frozen:      false,    // $mutate / $reset を無効にする (デフォルト: false)
  maskSecrets: true,     // エラーメッセージ内の値をマスクする (デフォルト: true)
  changeCase:  true,     // camelCase のキーを UPPER_SNAKE_CASE に変換する (デフォルト: true)
});
```

返却オブジェクトにはスキーマフィールドに加えて、以下の制御メソッドが含まれます。

| メソッド             | 説明                                         |
| -------------------- | -------------------------------------------- |
| `$mutate(overrides)` | ランタイムで値を上書き                       |
| `$reset()`           | すべての値を元の状態に戻す                   |
| `$load()`            | すべてのフィールドを即時解決・バリデーション |

### フィールドアクセサー

すべてのフィールドはアクセサーオブジェクトを返します。

| メソッド        | 利用可能なフィールド   | 説明                                               |
| --------------- | ---------------------- | -------------------------------------------------- |
| `$value()`      | 同期フィールド         | 解決済みの値を同期で返す                           |
| `$resolve()`    | すべてのフィールド     | 解決済みの値を Promise で返す                      |
| `$refresh()`    | 非同期フィールド       | 再フェッチを強制する（シークレット / 非同期 func） |
| `$versions`     | シークレットフィールド | シークレットマネージャーのバージョン履歴           |
| `$onChange(cb)` | すべてのフィールド     | 値の変化を購読。解除関数を返す                     |

**同期フィールド** (`t.string`、`t.number`、`t.boolean`、`t.date`、`t.url`、`t.duration`、`t.array`、`t.json`、`t.constant`、同期 `t.func`) は `SyncAccessor<T>` を返し、`$value()` と `$resolve()` の両方が使用できます。

**非同期フィールド** (`t.secret`、非同期 `t.func`、非同期フィールドを参照する `t.template`) は `AsyncAccessor<T>` を返します。`$resolve()` を使用してください。

### フィールド型

#### `t.string(options?)`

環境変数から文字列を読み込みます。

```typescript
SERVICE_NAME: t.string({ default: "api" }),
```

| オプション | 型       | 説明                                 |
| ---------- | -------- | ------------------------------------ |
| `key`      | `string` | 環境変数キーを上書き                 |
| `default`  | `string` | 環境変数がない場合のフォールバック値 |

#### `t.number(options?)`

環境変数から数値を読み込みます。

```typescript
PORT: t.number({ default: 3000 }),
```

#### `t.boolean(options?)`

ブール値を読み込みます。真値となる文字列: `"true"`、`"1"`、`"yes"`、`"on"`。

```typescript
DEBUG: t.boolean({ default: false }),
```

#### `t.date(options?)`

日付文字列を読み込んでパースします。対応フォーマット: ISO 8601、`YYYY-MM-DD`、`YYYY-MM`、`YYYY`。

```typescript
RELEASE_DATE: t.date(),
```

#### `t.url(options?)`

URL 文字列を読み込んでバリデーションします。

```typescript
API_ENDPOINT: t.url({ default: "https://api.example.com" }),
```

#### `t.duration(options?)`

人間が読めるデュレーション文字列 (`"5m"`、`"2h30m"`、`"1d"`) を読み込み、ミリ秒の数値として返します。

```typescript
CACHE_TTL: t.duration({ default: "5m" }),
```

#### `t.array(itemType, options?)`

カンマ区切りのリストを読み込み、各要素を `itemType` でパースします。

```typescript
ALLOWED_ORIGINS: t.array(t.string(), { default: ["localhost"] }),
```

#### `t.json(options?)`

JSON 文字列を読み込んでパースします。

```typescript
FEATURE_FLAGS: t.json<{ dark_mode: boolean }>(),
```

#### `t.constant(value)`

環境変数に依存しない固定値を定義します。

```typescript
VERSION: t.constant("1.0.0"),
```

#### `t.func(fn)`

関数によって値が計算されるフィールドです。関数は `{ values }` — 他のすべての設定フィールドへのプロキシ — を受け取ります。

```typescript
DB_URL: t.func(({ values }) =>
  `postgresql://${values.DB_HOST.$value()}:${values.DB_PORT.$value()}/mydb`
),
```

非同期関数を渡した場合、フィールドは非同期になります (`$resolve()` を使用)。

```typescript
GREETING: t.func(async ({ values }) => {
  const name = await values.NAME.$resolve();
  return `Hello, ${name}!`;
}),
```

#### `t.template(pattern)`

`{KEY}` 構文で他のフィールドの値を補間します。ネストしたグループのフィールドは `{GROUP.FIELD}` で参照します。

```typescript
BASE_URL: t.template("https://{HOST}:{PORT}/api"),
DB_URL:   t.template("postgresql://{DB.HOST}:{DB.PORT}/mydb"),
```

参照するフィールドが非同期の場合、テンプレートも非同期になります (`$resolve()` を使用)。

#### `t.object(fields)`

関連するフィールドをネームスペースにまとめます。ネストしたフィールドの環境変数キーは `{PREFIX}{GROUP_KEY}_{FIELD_KEY}` になります。

```typescript
const settings = defineSettings({
  DB: t.object({
    HOST: t.string({ default: "localhost" }),
    PORT: t.number({ default: 5432 }),
    NAME: t.string(),
  }),
});

settings.DB.HOST.$value(); // DB_HOST を読み込む
settings.DB.PORT.$value(); // DB_PORT を読み込む
```

#### `t.secret(options)`

シークレットマネージャーからシークレットをフェッチします。環境変数の値はマネージャー内の**シークレット名**として使用されます。レスポンスは設定可能な TTL でキャッシュされます。

```typescript
DB_CREDENTIALS: t.secret({
  adapter: AWSSecretsManager({ region: "us-east-1" }),
  schema: {
    host:     t.string(),
    port:     t.number(),
    password: t.string(),
  },
  ttl: "1h",
}),
```

| オプション | 型                        | 説明                                                                  |
| ---------- | ------------------------- | --------------------------------------------------------------------- |
| `adapter`  | `SecretAdapter \| string` | アダプターインスタンスまたは登録済みアダプター名                      |
| `schema`   | `SettingsSchema`          | シークレットの JSON 値をパースするスキーマ                            |
| `ttl`      | `string \| number`        | キャッシュ TTL (デュレーション文字列またはミリ秒)。デフォルト: `"1h"` |
| `key`      | `string`                  | シークレット名の環境変数キーを上書き                                  |

`$resolve()` でアクセスします。

```typescript
const creds = await settings.DB_CREDENTIALS.$resolve();
console.log(creds.host.$value());
```

キャッシュを強制更新する場合は `$refresh()` を呼び出します。

```typescript
await settings.DB_CREDENTIALS.$refresh();
```

#### `t.zodSchema(schema, options?)`

Zod スキーマでフィールドの値をバリデーションします (`zod` ピア依存が必要)。

```typescript
import { z } from "zod";

CONFIG: t.zodSchema(z.object({ debug: z.boolean() })),
```

#### `t.valibotSchema(schema, options?)`

Valibot スキーマでフィールドの値をバリデーションします (`valibot` ピア依存が必要)。

```typescript
import * as v from "valibot";

CONFIG: t.valibotSchema(v.object({ debug: v.boolean() })),
```

## シークレットアダプター

### AWS Secrets Manager

```bash
npm install @aws-sdk/client-secrets-manager
```

```typescript
import { defineSettings, types as t, AWSSecretsManager } from "@odoku-lab/settings";

const settings = defineSettings({
  API_KEY: t.secret({
    adapter: AWSSecretsManager({ region: "us-east-1" }),
  }),
});

const key = await settings.API_KEY.$resolve();
```

### Azure Key Vault

```bash
npm install @azure/keyvault-secrets @azure/identity
```

```typescript
import { AzureKeyVault } from "@odoku-lab/settings";

const settings = defineSettings({
  API_KEY: t.secret({
    adapter: AzureKeyVault({ vaultUrl: "https://my-vault.vault.azure.net" }),
  }),
});
```

### GCP Secret Manager

```bash
npm install @google-cloud/secret-manager
```

```typescript
import { GCPSecretManager } from "@odoku-lab/settings";

const settings = defineSettings({
  API_KEY: t.secret({
    adapter: GCPSecretManager({ projectId: "my-project" }),
  }),
});
```

### HashiCorp Vault (KV)

```bash
npm install node-vault
```

```typescript
import { VaultKV } from "@odoku-lab/settings";

const settings = defineSettings({
  API_KEY: t.secret({
    adapter: VaultKV({
      endpoint: "http://vault:8200",
      token:    process.env.VAULT_TOKEN,
    }),
  }),
});
```

### 名前付きアダプターレジストリ

アダプターをグローバルに登録し、任意の `t.secret()` 呼び出しで名前で参照できます。

```typescript
import { registerAdapter } from "@odoku-lab/settings";

registerAdapter("production", AWSSecretsManager({ region: "us-east-1" }));

const settings = defineSettings({
  API_KEY: t.secret({ adapter: "production" }),
});
```

## `$load()` による即時バリデーション

アプリ起動時に `$load()` を呼び出すことで、すべてのフィールドを即時に解決・バリデーションできます。未設定や不正な値があれば `SettingsValidationError` がスローされます。

```typescript
const settings = defineSettings({
  PORT:    t.number(),
  DB_HOST: t.string(),
});

await settings.$load();
```

## `$mutate()` と `$reset()`

ランタイムで値を上書きします。テストや機能フラグに便利です。

```typescript
settings.$mutate({ PORT: 9000 });
console.log(settings.PORT.$value()); // 9000

settings.$reset();
console.log(settings.PORT.$value()); // 元の値
```

`frozen: true` で設定をロックすると、ミューテーション時に `FrozenSettingsError` がスローされます。

```typescript
const settings = defineSettings(schema, { frozen: true });
settings.$mutate({ PORT: 9000 }); // FrozenSettingsError をスロー
```

## 変更追跡

```typescript
const unsubscribe = settings.PORT.$onChange((newValue, oldValue) => {
  console.log(`PORT が ${oldValue} から ${newValue} に変わりました`);
});

settings.$mutate({ PORT: 9000 }); // コールバックが発火

unsubscribe();
```

## `changeCase` オプション

`changeCase: true` (デフォルト) の場合、camelCase のスキーマキーは自動的に `UPPER_SNAKE_CASE` の環境変数名に変換されます。

```typescript
const settings = defineSettings({
  dbHost: t.string({ default: "localhost" }), // DB_HOST を読み込む
  apiKey: t.string(),                          // API_KEY を読み込む
});
```

## エラーハンドリング

| エラークラス              | スローされるタイミング                                    |
| ------------------------- | --------------------------------------------------------- |
| `MissingEnvError`         | 必須の環境変数が未設定                                    |
| `InvalidValueError`       | 値の型変換またはスキーマバリデーションに失敗              |
| `SchemaDefinitionError`   | テンプレートが存在しないフィールドを参照                  |
| `SettingsValidationError` | `$load()` からの集約エラー — `.errors` 配列を持つ         |
| `FrozenSettingsError`     | フリーズした設定オブジェクトへの `$mutate()` / `$reset()` |
| `SettingsError`           | すべての設定エラーの基底クラス                            |

```typescript
import { SettingsValidationError } from "@odoku-lab/settings";

try {
  await settings.$load();
} catch (e) {
  if (e instanceof SettingsValidationError) {
    for (const err of e.errors) {
      console.error(err.message);
    }
  }
}
```

## 型ユーティリティ

```typescript
import type { InferSettings, InferRawSettings, InferValue } from "@odoku-lab/settings";

const schema = {
  PORT: t.number({ default: 3000 }),
  HOST: t.string({ default: "localhost" }),
};

type AppSettings = InferSettings<typeof schema>;    // { PORT: SyncAccessor<number>; HOST: SyncAccessor<string> }
type RawSettings = InferRawSettings<typeof schema>; // 生のアクセサー型
type PortValue   = InferValue<typeof schema.PORT>;  // number
```

## ライセンス

MIT
