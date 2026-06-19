# ランタイム操作

`defineSettings` が返すオブジェクトには `$mutate()` と `$reset()` メソッドが付与されています。
テスト時の設定差し替えや、実行時の動的な値変更に使用します。

## $mutate()

既存の設定値を実行時に上書きします。引数は `DeepPartial<T>` 型（`$` で始まるキーは除外）で、部分的な上書きが可能です：

```typescript
const settings = defineSettings(schema);

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

## $reset()

`$mutate()` で行った全ての変更を破棄し、環境変数またはデフォルト値による初期状態に戻します：

```typescript
settings.$mutate({ port: 9000 });
console.log(settings.port.$value());  // 9000

settings.$reset();
console.log(settings.port.$value());  // 元の値（process.env["PORT"] または default）
```

## 型安全な部分更新

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

## frozen による操作禁止

`defineSettings` に `{ frozen: true }` を指定すると、`$mutate()` と `$reset()` が禁止されます。
これらを呼び出すと `FrozenSettingsError` がスローされます：

```typescript
import { FrozenSettingsError } from "@odoku-lab/settings";

const settings = defineSettings(schema, { frozen: true });

try {
  settings.$mutate({ port: 9000 });
} catch (e) {
  if (e instanceof FrozenSettingsError) {
    console.error("設定は frozen されています");
  }
}
```

本番環境での誤操作防止に使用します。詳細は[セキュリティガイド](/guides/security)を参照してください。

## $load() によるバリデーション

`$load()` を呼ぶと全フィールドを一括解決・検証します。`$mutate()` 後に `$load()` を呼び出すことで、上書き後の値が正しいかを検証できます：

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

`$load()` の詳細は[設定の読み込み](/guides/loading-settings)を参照してください。
