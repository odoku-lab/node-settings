# スキーマ定義ガイド

スキーマはプレーンな JavaScript オブジェクトとして定義します。
各キーに対応する型ファクトリー関数（`t.string()`, `t.number()` など）を値として設定します。

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  host: t.string({ default: "localhost" }),
  port: t.number({ default: 3000 }),
  debug: t.boolean({ default: false }),
});
```

## 共通オプション

`t.constant`、`t.template`、`t.object`、`t.secret` を除くほとんどの型ファクトリーは以下のオプションを受け付けます。

| オプション | 型        | 説明                                                                 |
| ---------- | --------- | -------------------------------------------------------------------- |
| `key`      | `string`  | 環境変数名を完全に上書き。指定すると `prefix` は無視される           |
| `prefix`   | `string`  | このフィールドのみのプレフィックスを上書き（`key` 未指定時に有効）   |
| `default`  | `T`       | 環境変数が未設定のときのデフォルト値                                 |
| `optional` | `boolean` | `true` にすると環境変数が未設定でも `undefined` を返す（エラーなし） |

### `key` と `prefix` の例

```typescript
const settings = defineSettings(
  {
    // key: 環境変数名を完全指定（prefix・changeCase の影響を受けない）
    apiKey: t.string({ key: "API_KEY" }),
    // → process.env["API_KEY"] を読む

    // prefix: このフィールドのみのプレフィックスを上書き
    // 環境変数名は prefix + changeCase 適用後のスキーマキー
    dbHost: t.string({ prefix: "CUSTOM_" }),
    // → process.env["CUSTOM_DB_HOST"] を読む（"DB_HOST" は "dbHost" を changeCase した結果）
  },
  { prefix: "APP_" }, // グローバル prefix（key/prefix オプションで上書き可能）
);
```

### `default` と `optional` の使い分け

```typescript
const schema = {
  // 必須フィールド（未設定なら MissingEnvError）
  dbUrl: t.string(),

  // デフォルト値あり（未設定でもエラーにならない）
  port: t.number({ default: 3000 }),

  // 任意フィールド（未設定なら undefined）
  logLevel: t.string({ optional: true }),
};
```

---

## 定義タイプ

### t.string()

```typescript
t.string(opts?: {
  key?: string;
  prefix?: string;
  default?: string;
  optional?: boolean;
  regex?: RegExp;
  options?: readonly string[];
}): TypeDef<string>
```

文字列型フィールドを定義します。正規表現による検証や、許可する値の一覧を指定できます。`options` に `as const` 配列を渡すとリテラルユニオン型として推論されます。

```typescript
const settings = defineSettings({
  // 正規表現によるバリデーション
  slug: t.string({ regex: /^[a-z0-9-]+$/ }),

  // 許可する値の制限（リテラル型として推論）
  logLevel: t.string({ options: ["debug", "info", "warn", "error"] as const }),
  // → TypeDef<"debug" | "info" | "warn" | "error">
});
```

**タイプ固有のオプション:**

| オプション | 型                  | 説明                                                               |
| ---------- | ------------------- | ------------------------------------------------------------------ |
| `regex`    | `RegExp`            | 値が一致しなければならない正規表現。不一致なら `InvalidValueError` |
| `options`  | `readonly string[]` | 許可する値の一覧。`as const` 配列でリテラル型として推論される      |

---

### t.number()

```typescript
t.number(opts?: {
  key?: string;
  prefix?: string;
  default?: number;
  optional?: boolean;
  options?: readonly number[];
  integer?: boolean;
  min?: number;
  max?: number;
}): TypeDef<number>
```

数値型フィールドを定義します。文字列から数値へのパース、整数チェック、範囲チェック、許可する値の制限が可能です。

```typescript
const settings = defineSettings({
  port: t.number({ default: 3000, integer: true, min: 1024, max: 65535 }),
  retries: t.number({ options: [1, 3, 5] as const }),
  // → TypeDef<1 | 3 | 5>
});
```

**タイプ固有のオプション:**

| オプション | 型                  | 説明                                                          |
| ---------- | ------------------- | ------------------------------------------------------------- |
| `options`  | `readonly number[]` | 許可する値の一覧。`as const` 配列でリテラル型として推論される |
| `integer`  | `boolean`           | `true` の場合、整数のみ許可。小数なら `InvalidValueError`     |
| `min`      | `number`            | 最小値（以上）チェック                                        |
| `max`      | `number`            | 最大値（以下）チェック                                        |

---

### t.boolean()

```typescript
t.boolean(opts?: {
  key?: string;
  prefix?: string;
  default?: boolean;
  optional?: boolean;
  trueValues?: string[];
  falseValues?: string[];
  allowUnrecognized?: boolean;
}): TypeDef<boolean>
```

真偽値型フィールドを定義します。`true`/`false` として認識する文字列をカスタマイズできます。

```typescript
const settings = defineSettings({
  // デフォルト: "true","1","yes" → true / "false","0","no" → false
  debug: t.boolean({ default: false }),

  // カスタム値
  featureEnabled: t.boolean({
    trueValues: ["enabled", "yes", "1"],
    falseValues: ["disabled", "no", "0"],
    allowUnrecognized: false, // 不明な値はエラー
  }),
});
```

**タイプ固有のオプション:**

| オプション          | 型         | 説明                                                                                        |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `trueValues`        | `string[]` | `true` として扱う文字列の一覧（デフォルト: `["true", "1", "yes"]`）                         |
| `falseValues`       | `string[]` | `false` として扱う文字列の一覧（デフォルト: `["false", "0", "no"]`）                        |
| `allowUnrecognized` | `boolean`  | 未知の値を `false` として扱うか。`false` にすると `InvalidValueError`（デフォルト: `true`） |

---

### t.date()

```typescript
t.date(opts?: {
  key?: string;
  prefix?: string;
  default?: Date;
  optional?: boolean;
  format?: string;
}): TypeDef<Date>
```

日付型フィールドを定義します。`format` 未指定時は ISO 8601 形式として解釈します。`format` を指定するとカスタムフォーマットでパースします。

```typescript
const settings = defineSettings({
  // ISO 8601（デフォルト）
  startedAt: t.date(),
  // env: STARTED_AT="2024-01-15T10:30:00Z"

  // カスタムフォーマット
  expiresAt: t.date({ format: "yyyy-MM-dd" }),
  // env: EXPIRES_AT="2024-12-31"

  releaseTime: t.date({ format: "HH:mm:ss" }),
  // env: RELEASE_TIME="14:00:00"
});
```

**タイプ固有のオプション:**

| オプション | 型       | 説明                                                                                                                                                       |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`   | `string` | カスタム日付フォーマット。トークン: `yyyy`/`yy`（年）、`MM`/`M`（月）、`dd`/`d`（日）、`HH`/`H`（時）、`mm`/`m`（分）、`ss`/`s`（秒）。未指定時は ISO 8601 |

---

### t.array()

```typescript
t.array<F extends TypeDef<unknown> = TypeDef<string>>(opts?: {
  key?: string;
  prefix?: string;
  default?: T[];
  optional?: boolean;
  type?: F;
  delimiter?: string;
}): TypeDef<T[]>
```

配列型フィールドを定義します。区切り文字で分割した文字列をパースし、各要素を指定した型で解釈します。

```typescript
const settings = defineSettings({
  // デフォルト: カンマ区切りの文字列配列
  allowedOrigins: t.array(),
  // env: ALLOWED_ORIGINS="https://a.com,https://b.com"
  // → ["https://a.com", "https://b.com"]

  // スペース区切り
  tags: t.array({ delimiter: " " }),
  // env: TAGS="foo bar baz" → ["foo", "bar", "baz"]

  // 数値配列
  ports: t.array({ type: t.number(), delimiter: "," }),
  // env: PORTS="3000,3001,3002" → [3000, 3001, 3002]
});
```

**タイプ固有のオプション:**

| オプション  | 型           | 説明                                               |
| ----------- | ------------ | -------------------------------------------------- |
| `type`      | `TypeDef<T>` | 各要素の型ファクトリー（デフォルト: `t.string()`） |
| `delimiter` | `string`     | 要素の区切り文字（デフォルト: `","`）              |

---

### t.json()

```typescript
t.json<TSchema = unknown>(opts?: {
  key?: string;
  prefix?: string;
  default?: TSchema;
  optional?: boolean;
}): TypeDef<TSchema>
```

JSON 型フィールドを定義します。環境変数の文字列値を `JSON.parse` でパースして返します。型パラメータで戻り値の型を指定できます。

```typescript
const settings = defineSettings({
  dbConfig: t.json<{ host: string; port: number }>(),
  // env: DB_CONFIG='{"host":"localhost","port":5432}'
  // → { host: "localhost", port: 5432 }

  featureFlags: t.json<Record<string, boolean>>({ default: {} }),
});
```

---

### t.url()

```typescript
t.url(opts?: {
  key?: string;
  prefix?: string;
  default?: URL;
  optional?: boolean;
}): TypeDef<URL>
```

URL 型フィールドを定義します。環境変数の文字列値を `new URL()` でパースして `URL` オブジェクトとして返します。不正な URL は `InvalidValueError` になります。

```typescript
const settings = defineSettings({
  apiUrl: t.url(),
  // env: API_URL="https://api.example.com" → URL オブジェクト

  webhookUrl: t.url({ optional: true }),
});

const url = settings.apiUrl.$value();
console.log(url.hostname); // "api.example.com"
```

---

### t.duration()

```typescript
t.duration(opts?: {
  key?: string;
  prefix?: string;
  default?: number;
  optional?: boolean;
}): TypeDef<number>
```

時間文字列をミリ秒の数値に変換するフィールドを定義します。`ms`、`s`、`m`、`h`、`d`、`w` の単位付き文字列をパースします。単位省略時はミリ秒として扱います。

```typescript
const settings = defineSettings({
  sessionTtl: t.duration({ default: 3_600_000 }),
  // env: SESSION_TTL="30m" → 1800000
  // env: SESSION_TTL="1h" → 3600000
  // env: SESSION_TTL="500ms" → 500
  // env: SESSION_TTL="7d" → 604800000

  requestTimeout: t.duration({ default: 5000 }),
  // env: REQUEST_TIMEOUT="10s" → 10000
});
```

---

### t.template()

```typescript
t.template(tmpl: string): TypeDef<Promise<string>>
```

他フィールドの値を埋め込んだ文字列を生成するフィールドを定義します。`{FIELD_NAME}` または `{GROUP.FIELD}` の形式でプレースホルダーを記述します。

戻り値は `$value()` と `$resolve()` の両方を持ちます。参照先に非同期フィールド（`t.func(async ...)` など）が含まれる場合は `$resolve()` を使用してください。参照先が全て同期フィールドの場合は `$value()` でも取得できます。

```typescript
const settings = defineSettings({
  host: t.string({ default: "localhost" }),
  port: t.number({ default: 3000 }),
  baseUrl: t.template("http://{host}:{port}"),
  // → "http://localhost:3000"
});

// 通常は $resolve() を推奨
const url = await settings.baseUrl.$resolve();

// 参照先が全て同期フィールドなら $value() も使える
const urlSync = settings.baseUrl.$value();
```

グループ内のフィールドを参照するには `{GROUP.FIELD}` の形式を使います。

```typescript
const settings = defineSettings({
  db: t.object({
    host: t.string({ default: "db.local" }),
    port: t.number({ default: 5432 }),
  }),
  dbUrl: t.template("postgres://{db.host}:{db.port}/myapp"),
});

const url = await settings.dbUrl.$resolve(); // "postgres://db.local:5432/myapp"
```

---

### t.func()

```typescript
// 同期
t.func<T, V = ValuesProxy>(
  fn: (ctx: ResolveCtx<V>) => T,
  opts?: { ttl?: number; key?: string; prefix?: string },
): TypeDef<T>

// 非同期（async 関数を渡す）
t.func<T, V = ValuesProxy>(
  fn: (ctx: ResolveCtx<V>) => Promise<T>,
  opts?: { ttl?: number; key?: string; prefix?: string },
): TypeDef<Promise<T>>
```

任意の計算ロジックを記述するフィールドを定義します。`ResolveCtx` を受け取り、他フィールドへのアクセスや環境変数の直接参照が可能です。同期関数を渡すと `$value()` でアクセスできる同期フィールドに、async 関数を渡すと `$resolve()` でアクセスできる非同期フィールドになります。

```typescript
const settings = defineSettings({
  host: t.string({ default: "localhost" }),
  port: t.number({ default: 3000 }),

  // 同期フィールド
  baseUrl: t.func(({ values }) => {
    const host = values.host.$value();
    const port = values.port.$value();
    return `http://${host}:${port}`;
  }),

  // 非同期フィールド
  remoteConfig: t.func(async ({ values }) => {
    const url = values.baseUrl.$value();
    const res = await fetch(`${url}/config`);
    return res.json() as Promise<Record<string, unknown>>;
  }),
});

settings.baseUrl.$value();                     // 同期アクセス
await settings.remoteConfig.$resolve();        // 非同期アクセス
```

`ctx.raw` でこのフィールドに対応する環境変数の生の値を参照できます。

```typescript
const settings = defineSettings({
  dbUrl: t.func(({ raw, values }) => {
    if (raw) return raw; // 環境変数が設定されていればそちらを使う
    const host = values.dbHost.$value();
    return `postgres://${host}:5432/mydb`;
  }),
  dbHost: t.string({ default: "localhost" }),
});
```

**タイプ固有のオプション:**

| オプション | 型       | 説明                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------ |
| `ttl`      | `number` | キャッシュの有効期限（ミリ秒）。期限切れ後の `$resolve()` で再計算される |

**TTL キャッシュの例:**

```typescript
const settings = defineSettings({
  featureFlags: t.func(async () => fetchFlags(), { ttl: 60_000 }),
  // 60 秒間はキャッシュを使い、期限切れ後の $resolve() で再フェッチ
});
```

---

### t.constant()

```typescript
t.constant<T>(value: T): TypeDef<T>
```

環境変数を読まず、常に固定値を返すフィールドを定義します。計算結果やハードコードされた値を設定オブジェクトに含める場合に使用します。

```typescript
const settings = defineSettings({
  port: t.number({ default: 3000 }),
  appVersion: t.constant("1.2.3"),
  maxRetries: t.constant(3),
  environment: t.constant(process.env.NODE_ENV ?? "development"),
});

settings.appVersion.$value(); // "1.2.3"
settings.maxRetries.$value(); // 3
```

---

### t.object()

```typescript
t.object<S extends SettingsSchema>(
  schema: S,
  opts?: { prefix?: string },
): TypeDef<InferSettings<S>>
```

フィールドをネストした構造にまとめるグループを定義します。グループ内の各フィールドは `グループキー_フィールドキー` の形式で環境変数から解決されます。

:::caution プレーンオブジェクトは使用不可
スキーマにプレーンオブジェクトを直接ネストすることはできません。必ず `t.object()` を使ってください。プレーンオブジェクトは `t.constant()` として扱われます。
:::

```typescript
const settings = defineSettings(
  {
    db: t.object({
      host: t.string({ default: "localhost" }), // → APP_DB_HOST
      port: t.number({ default: 5432 }),         // → APP_DB_PORT
      name: t.string(),                          // → APP_DB_NAME
    }),
  },
  { prefix: "APP_" },
);

settings.db.host.$value(); // "localhost"
settings.db.port.$value(); // 5432
```

**タイプ固有のオプション:**

| オプション | 型       | 説明                                                                            |
| ---------- | -------- | ------------------------------------------------------------------------------- |
| `prefix`   | `string` | グループのグローバル prefix を上書き。グループキー（例: `DB_`）は常に付与される |

**prefix の例:**

```typescript
const settings = defineSettings(
  {
    // prefix 未指定: グローバル prefix "APP_" がそのまま使われる
    db: t.object({
      host: t.string({ default: "localhost" }), // → APP_DB_HOST
    }),

    // prefix 指定: グローバル prefix を "REDIS_" に上書き（グループキー "CACHE_" は常に付与）
    cache: t.object(
      {
        host: t.string({ default: "localhost" }), // → REDIS_CACHE_HOST
        port: t.number({ default: 6379 }),          // → REDIS_CACHE_PORT
      },
      { prefix: "REDIS_" },
    ),
  },
  { prefix: "APP_" },
);
```

---

### t.zodSchema()

:::note 外部ライブラリが必要
`t.zodSchema()` を使用するには `zod` パッケージが必要です。
:::

```typescript
t.zodSchema<T>(opts: {
  schema: ZodType<T>;
  key?: string;
  prefix?: string;
  default?: T;
  optional?: boolean;
}): TypeDef<T>
```

[Zod](https://zod.dev/) スキーマを使って環境変数の値を検証・変換します。

```typescript
import { z } from "zod";
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  apiUrl: t.zodSchema({
    schema: z.string().url(),
  }),

  port: t.zodSchema({
    schema: z.coerce.number().int().min(1024).max(65535),
    default: 3000,
  }),
});
```

---

### t.valibotSchema()

:::note 外部ライブラリが必要
`t.valibotSchema()` を使用するには [Standard Schema v1](https://standardschema.dev/) に対応したライブラリ（`valibot` など）が必要です。非同期スキーマはサポートしていません。
:::

```typescript
t.valibotSchema<T>(opts: {
  schema: StandardSchemaV1<T>;
  key?: string;
  prefix?: string;
  default?: T;
  optional?: boolean;
}): TypeDef<T>
```

Standard Schema v1 インターフェースに対応したスキーマで環境変数の値を検証・変換します。

```typescript
import * as v from "valibot";
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  port: t.valibotSchema({
    schema: v.pipe(v.string(), v.transform(Number), v.number(), v.integer()),
  }),

  logLevel: t.valibotSchema({
    schema: v.picklist(["debug", "info", "warn", "error"]),
    default: "info",
  }),
});
```

---

## シークレット型（t.secret）

外部のシークレット管理サービス（AWS Secrets Manager、Azure Key Vault、GCP Secret Manager など）から値を取得する `t.secret` については、[シークレットガイド](/guides/secrets) を参照してください。
