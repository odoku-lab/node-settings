# 設定の読み込み

## defineSettings() の利用方法

`defineSettings` はスキーマ定義から設定オブジェクトを生成します。

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings(schema, options?);
```

### 返り値

返り値は各フィールドに [SyncAccessor または AsyncAccessor](/api/types) を持つ Proxy オブジェクトです。
加えて `$mutate()`、`$reset()`、`$load()` メソッドが付与されます。

```typescript
settings.port.$value();          // 同期フィールドの値を取得
await settings.apiKey.$resolve(); // 非同期フィールドの値を取得
await settings.$load();           // 全フィールドを一括解決・検証
settings.$mutate({ port: 9000 }); // 実行時に設定値を上書き
settings.$reset();                // $mutate の変更を破棄
```

### 遅延評価

`defineSettings` はスキーマを解析してストアを構築しますが、各フィールドの実際の値は **`$value()` / `$resolve()` を呼び出すまで解決されません**（遅延評価）。

```typescript
const settings = defineSettings(schema);
// この時点では環境変数はまだ参照されていない

const port = settings.port.$value();
// ここで初めて process.env["PORT"] が参照・パース・バリデーションされる
```

`t.func()` や `t.template()` で他フィールドを参照する場合、参照先が先に解決されます。

```typescript
const schema = {
  host: t.string({ default: "localhost" }),
  port: t.number({ default: 3000 }),
  url: t.template("http://{host}:{port}"),
  // url を $resolve() で解決する際、host と port が先に解決される
};
```

### 型推論

`InferSettings` ユーティリティ型でスキーマから設定型を導出できます：

```typescript
import { type InferSettings, defineSettings, types as t } from "@odoku-lab/settings";

const schema = {
  port: t.number({ default: 3000 }),
  host: t.string({ default: "localhost" }),
};

export type Settings = InferSettings<typeof schema>;
// {
//   port: SyncAccessor<number>;
//   host: SyncAccessor<string>;
// }

export const settings = defineSettings(schema);
```

## オプション（SettingsOptions）

### `prefix`

全ての環境変数キーに付与するプレフィックス：

```typescript
const settings = defineSettings(schema, { prefix: "MY_APP_" });
// host → process.env["MY_APP_HOST"]
```

### `source`

明示的な環境変数ソースを指定します。指定すると `process.env` の代わりに使用されます：

```typescript
// source 指定なし → process.env から読む
const settings = defineSettings(schema);

// source 指定あり → { PORT: "8080" } のみから読む（process.env は無視）
const settings2 = defineSettings(schema, {
  source: { HOST: "example.com", PORT: "8080" },
});
```

テストなど環境変数を差し替えたい場合に便利です。

`.env` ファイルはライブラリ自体では読み込みません。[dotenv](https://github.com/motdotla/dotenv) などを使ってアプリ側で `process.env` に展開してください。

### `frozen`

`true` を指定すると `$mutate()` / `$reset()` の呼び出しが `FrozenSettingsError` をスローします。
本番環境での誤操作防止に使用します。

```typescript
import { FrozenSettingsError, defineSettings } from "@odoku-lab/settings";

const settings = defineSettings(schema, { frozen: true });

try {
  settings.$mutate({ port: 9000 });
} catch (e) {
  if (e instanceof FrozenSettingsError) {
    console.error("設定は frozen されています");
  }
}
```

### `maskSecrets`

デフォルト `true`。フィールド名が以下のパターンに一致するフィールドのエラーメッセージ内の値を自動マスクします：

```
secret|password|passwd|token|api[_-]?key|auth|credential
```

```typescript
const settings = defineSettings(schema, { maskSecrets: false });  // 無効化
```

### `changeCase`

デフォルト `true`。スキーマキーを `UPPER_SNAKE_CASE` に自動変換して環境変数名として使用します：

```typescript
// changeCase: true（デフォルト）
const schema = { myPort: t.number() };
const settings = defineSettings(schema);
// myPort → process.env["MY_PORT"]

// changeCase: false（変換しない）
const settings2 = defineSettings(schema, { changeCase: false });
// myPort → process.env["myPort"]
```

詳細は[スキーマ定義ガイド](/guides/defining-schema)を参照してください。

## メソッド

### `$load()`

全フィールドを一括解決・検証します。エラーを収集して `SettingsValidationError` としてまとめてスローします。
アプリ起動時に呼び出すことで、設定ミスを早期に検出できます。

```typescript
import { SettingsValidationError } from "@odoku-lab/settings";

try {
  await settings.$load();
} catch (e) {
  if (e instanceof SettingsValidationError) {
    for (const err of e.errors) {
      console.error(err.message);
    }
    process.exit(1);
  }
}
```

個々のフィールドを `$value()` で参照した場合は、そのフィールド単体のエラーが即座にスローされます。

### `$mutate(overrides)`

実行時に設定値を上書きします。引数は `DeepPartial<T>` 型（`$` で始まるキーは除外）で、部分的な上書きが可能です。

```typescript
// 単一の値を上書き
settings.$mutate({ port: 9000 });
console.log(settings.port.$value()); // 9000

// ネストされた値（t.object）を部分上書き
settings.$mutate({
  db: {
    host: "db.internal",
  },
});
// db.host のみ上書き。db.port は維持される
```

`$mutate()` は内部的にオーバーライドマップで管理します。元のスキーマ定義は変更されません。

`$mutate()` の引数は `DeepPartial<InferSettings<T>>` として型推論されます：

```typescript
const schema = {
  port: t.number(),
  db: t.object({
    host: t.string(),
    port: t.number(),
  }),
};

const settings = defineSettings(schema);

settings.$mutate({
  port: 8080,                          // OK
  db: { host: "db.example.com" },      // OK（部分更新）
  // db: { host: 123 },                // Type Error: string expected
  // unknown: "value",                 // Type Error: unknown key
});
```

`$mutate()` 後に `$load()` を呼び出すことで、上書き後の値が正しいかを検証できます：

```typescript
settings.$mutate({ port: -1 });

try {
  await settings.$load();
} catch (e) {
  if (e instanceof SettingsValidationError) {
    // InvalidValueError: -1 is less than minimum value 0
    console.error(e.errors[0].message);
  }
}
```

### `$reset()`

`$mutate()` で行った全ての変更を破棄し、環境変数またはデフォルト値による初期状態に戻します：

```typescript
settings.$mutate({ port: 9000 });
console.log(settings.port.$value());  // 9000

settings.$reset();
console.log(settings.port.$value());  // 元の値（process.env["PORT"] または default）
```

## エラーハンドリング

`$value()` がスローする可能性のあるエラーについては[エラーハンドリングガイド](/guides/error-handling)を参照してください。
