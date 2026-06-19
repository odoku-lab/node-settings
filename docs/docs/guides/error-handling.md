# エラーハンドリング

node-settings は階層化されたエラークラスを提供します。

## エラークラス階層

```
SettingsError (基底クラス)
├── MissingEnvError        — 必須の環境変数が未設定
├── InvalidValueError      — 値の型変換・バリデーション失敗
├── SchemaDefinitionError  — スキーマ定義が不正
├── FrozenSettingsError    — frozen な設定への mutate/reset 操作
└── SettingsValidationError — 複数のエラーを集約（$load() がスロー）
```

## SettingsValidationError

`$load()` は全フィールドのエラーを収集し、まとめて `SettingsValidationError` としてスローします。
`errors` プロパティに個々のエラー（`MissingEnvError` や `InvalidValueError` など）の配列が入っています。

```typescript
import {
  defineSettings,
  SettingsValidationError,
  MissingEnvError,
  InvalidValueError,
} from "@odoku-lab/settings";

const settings = defineSettings(schema);

try {
  await settings.$load();
} catch (e) {
  if (e instanceof SettingsValidationError) {
    console.error(`${e.errors.length} 件のエラーが発生しました:`);
    for (const err of e.errors) {
      console.error(`  [${err.constructor.name}] ${err.message}`);
    }
    process.exit(1);
  }
  throw e;
}
```

エラーメッセージ例：

```
Failed to load settings (3 error(s)):
  - Missing required environment variable: DB_PASSWORD
  - Invalid value for DB_URL: "not-a-url" is not a valid URL
  - Invalid value for PORT: "abc" is not a valid number
```

個別フィールドを `$value()` で参照した場合は、そのフィールドのエラーが即座にスローされます（`SettingsValidationError` ではなく直接 `MissingEnvError` や `InvalidValueError` がスローされます）。

## MissingEnvError

必須フィールドに対応する環境変数が設定されていない場合に発生します。

```typescript
const schema = {
  apiKey: t.string(),  // 必須、デフォルトなし
};
// API_KEY が未設定 → MissingEnvError
```

`fieldName` プロパティでフィールド名を取得できます：

```typescript
if (e instanceof MissingEnvError) {
  console.error(`${e.fieldName} is required`);
}
```

## InvalidValueError

値の型変換やバリデーションに失敗した場合に発生します。

```typescript
const schema = {
  port: t.number(),                               // "abc" → InvalidValueError
  host: t.string({ regex: /^https?:\/\// }),      // 形式不一致 → InvalidValueError
  level: t.string({ options: ["low", "high"] as const }), // 許可外の値 → InvalidValueError
};
```

## SchemaDefinitionError

スキーマ定義自体に問題がある場合に発生します。

```typescript
// 存在しないフィールドを参照した場合
const schema = {
  url: t.template("{undefinedField}"),  // → SchemaDefinitionError
};

// t.func() で存在しないフィールドにアクセスした場合
const schema2 = {
  url: t.func((ctx) => ctx.values.nonExistent.$value()),  // → SchemaDefinitionError
};
```

## FrozenSettingsError

`frozen: true` を指定した設定に対して `$mutate()` または `$reset()` を呼び出した場合に発生します。

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

`frozen` オプションの詳細は[設定の読み込み](/guides/loading-settings#frozen)を参照してください。

## シークレットマスキング

`maskSecrets`（デフォルト `true`）が有効な場合、フィールド名が以下のパターンに一致すると、エラーメッセージ内の値が自動的にマスクされます（詳細は[設定の読み込み](/guides/loading-settings#masksecrets)を参照）：

```typescript
const schema = {
  dbPassword: t.string({ regex: /^.{8,}$/ }),
};

// 値が "short" の場合のエラー:
// Invalid value for DB_PASSWORD: "sho***ort" does not match /^.{8,}$/
```
