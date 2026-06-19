# シークレット管理

`t.secret()` は AWS Secrets Manager・Azure Key Vault・GCP Secret Manager・HashiCorp Vault などの外部シークレットストアから値を取得するフィールド型です。非同期フィールドとして動作し、[AsyncAccessor](/api/types#asyncaccessort) を返します。

## 基本的な使い方

```typescript
import { AWSSecretsManager, defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  // 環境変数 DB_PASSWORD の値がシークレット名として使われる
  DB_PASSWORD: t.secret({
    adapter: AWSSecretsManager({ region: "ap-northeast-1" }),
  }),
});

const password = await settings.DB_PASSWORD.$resolve();
```

シークレット名は、スキーマキーに対応する環境変数の値から取得します。上の例では `process.env.DB_PASSWORD` の値（例: `"prod/db/password"`）がシークレット名として Secrets Manager に渡されます。

## オプション

### `adapter`

シークレットの取得に使用するアダプターを指定します。`SecretAdapter` インスタンスを直接渡すか、`registerAdapter` で登録済みのアダプター名（文字列）を指定できます。

```typescript
// インスタンスを直接渡す
t.secret({ adapter: AWSSecretsManager({ region: "ap-northeast-1" }) })

// 登録済みアダプター名を文字列で指定
t.secret({ adapter: "aws" })
```

### `schema`

シークレット値が JSON の場合、`schema` オプションでサブスキーマを定義すると型安全にパースできます。

```typescript
const settings = defineSettings({
  // DB_SECRET_NAME 環境変数に設定されたシークレット名から JSON を取得
  DB_SECRET_NAME: t.secret({
    adapter: AWSSecretsManager({ region: "ap-northeast-1" }),
    schema: {
      host: t.string(),
      port: t.number(),
      username: t.string(),
      password: t.string(),
    },
  }),
});

const db = await settings.DB_SECRET_NAME.$resolve();
// db.host, db.port, db.username, db.password が利用可能
```

サブスキーマのフィールドはシークレットの JSON キーに対して直接マッチします（環境変数は参照しません）。

### `ttl`

ミリ秒単位のキャッシュ有効期限を指定します。`$resolve()` はキャッシュ期間中は再フェッチせずにキャッシュ値を返します。期限切れ後の次の `$resolve()` 呼び出しで再フェッチします。

```typescript
t.secret({
  adapter: AWSSecretsManager({ region: "ap-northeast-1" }),
  ttl: 300_000, // 5分間キャッシュ
})
```

`ttl` を省略すると、一度取得した値を永続的にキャッシュします（プロセス再起動まで）。

### `optional`

`optional: true` を指定すると、環境変数が未設定のときに `undefined` を返します（エラーなし）。

```typescript
const settings = defineSettings({
  OPTIONAL_SECRET: t.secret({
    adapter: AWSSecretsManager({ region: "ap-northeast-1" }),
    optional: true,
  }),
});

const value = await settings.OPTIONAL_SECRET.$resolve(); // string | undefined
```

### `key` / `prefix`

他のフィールド型と同様に、`key` で参照する環境変数名を上書きしたり、`prefix` でプレフィックスを付加したりできます。

```typescript
t.secret({
  adapter: AWSSecretsManager({ region: "ap-northeast-1" }),
  key: "MY_SECRET_NAME",   // 環境変数名を上書き
})
```

## 組み込みアダプター

### AWS Secrets Manager

```bash
npm install @aws-sdk/client-secrets-manager
```

```typescript
import { AWSSecretsManager } from "@odoku-lab/settings";

const adapter = AWSSecretsManager({
  region: "ap-northeast-1",
  // credentials は省略可能（環境変数 / IAM ロールから自動取得）
  credentials: {
    accessKeyId: "...",
    secretAccessKey: "...",
  },
});
```

### Azure Key Vault

```bash
npm install @azure/keyvault-secrets @azure/identity
```

```typescript
import { AzureKeyVault } from "@odoku-lab/settings";

const adapter = AzureKeyVault({
  vaultUrl: "https://my-vault.vault.azure.net",
  // credential は省略可能（DefaultAzureCredential が自動的に使われる）
});
```

### GCP Secret Manager

```bash
npm install @google-cloud/secret-manager
```

```typescript
import { GCPSecretManager } from "@odoku-lab/settings";

const adapter = GCPSecretManager({
  projectId: "my-gcp-project",
  // credentials は省略可能（Application Default Credentials から自動取得）
});
```

### HashiCorp Vault (KV)

```bash
npm install node-vault
```

```typescript
import { VaultKV } from "@odoku-lab/settings";

const adapter = VaultKV({
  endpoint: "https://vault.example.com",
  token: process.env.VAULT_TOKEN,
  kvVersion: 2, // KV v1 の場合は 1
  mountPath: "secret",
});
```

## メソッド（AsyncAccessor）

`t.secret()` フィールドは `AsyncAccessor` として公開され、以下のメソッドとプロパティが利用できます。

### `$resolve()`

シークレット値を取得します。キャッシュが有効な場合はキャッシュ値を返し、失効していれば再フェッチします。

```typescript
const value = await settings.API_SECRET.$resolve();
```

### `$refresh()`

キャッシュを無効化して強制的に再フェッチします。シークレットをローテーションした後などに使用します。

```typescript
// シークレットをローテーションした後
const newValue = await settings.API_SECRET.$refresh();
```

### `$versions`

これまでに取得したシークレットのバージョン ID の配列です。ローテーション検知などに利用できます。

```typescript
const value = await settings.API_SECRET.$resolve();
console.log(settings.API_SECRET.$versions); // ["v1", "v2", ...]
```

### `$onChange()`

シークレット値が変更されたときに呼び出されるコールバックを登録します。戻り値の関数を呼び出すと監視を解除できます。

```typescript
const unsubscribe = settings.API_SECRET.$onChange((next, prev) => {
  console.log("シークレットが更新されました");
  rotateConnections(next as string);
});

// 監視を解除
unsubscribe();
```

## アダプターの共有（registerAdapter）

同じアダプターを複数のフィールドで使い回す場合、`registerAdapter` でグローバルに登録しておくと、文字列名で参照できます。

```typescript
import { registerAdapter, AWSSecretsManager, defineSettings, types as t } from "@odoku-lab/settings";

registerAdapter("aws", AWSSecretsManager({ region: "ap-northeast-1" }));

const settings = defineSettings({
  DB_SECRET: t.secret({ adapter: "aws" }),
  API_SECRET: t.secret({ adapter: "aws", ttl: 60_000 }),
});
```

## カスタムアダプターの作成

`SecretAdapter` インターフェースを実装することで、独自のシークレットバックエンドを作成できます。

```typescript
export interface SecretValue {
  value: string;
  versionId?: string;
  leaseDuration?: number;
}

export interface SecretAdapter {
  readonly provider: string;
  fetch(name: string, options?: { versionId?: string }): Promise<SecretValue>;
}
```

以下は環境変数から値を読むシンプルなアダプターの実装例です。開発環境でシークレットストアを使わずに動作させたい場合などに便利です。

```typescript
import type { SecretAdapter, SecretValue } from "@odoku-lab/settings";

const EnvAdapter: SecretAdapter = {
  provider: "env",

  async fetch(name: string): Promise<SecretValue> {
    const value = process.env[name];

    if (value === undefined) {
      throw new Error(`Environment variable "${name}" is not set`);
    }

    return { value };
  },
};

// 登録して使用する
registerAdapter("env", EnvAdapter);

const settings = defineSettings({
  DB_PASSWORD: t.secret({ adapter: "env" }),
});
```
