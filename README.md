# @odoku-lab/settings

[![CI](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe environment variable / settings loader for Node.js and TypeScript. Define your schema once and get a fully-typed, lazily-evaluated settings object.

- **Lazy evaluation** — all fields resolve on demand via `$value()` / `$resolve()`
- **Secret management** — built-in TTL caching and adapters for AWS, Azure, GCP, and HashiCorp Vault
- **Nested groups** — structure related settings with `t.object()`
- **Mutation & reset** — override values at runtime without touching `process.env`
- **Schema validation** — plug in Zod or Valibot schemas
- **Change tracking** — subscribe to value changes with `$onChange()`

## Installation

```bash
npm install @odoku-lab/settings
```

## Quick Start

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  PORT:     t.number({ default: 3000 }),
  HOST:     t.string({ default: "localhost" }),
  DEBUG:    t.boolean({ default: false }),
  BASE_URL: t.template("http://{HOST}:{PORT}"),
});

// Sync fields: use $value()
console.log(settings.PORT.$value());   // 3000
console.log(settings.DEBUG.$value());  // false

// Async fields: use $resolve()
console.log(await settings.BASE_URL.$resolve()); // "http://localhost:3000"
```

## API Reference

### `defineSettings(schema, options?)`

Creates a type-safe settings proxy from a schema object.

```typescript
const settings = defineSettings(schema, {
  prefix:      "APP_",   // prepend to all env var keys (default: "")
  source:      {},       // use a custom object instead of process.env
  frozen:      false,    // disable $mutate / $reset (default: false)
  maskSecrets: true,     // mask values in error messages (default: true)
  changeCase:  true,     // convert camelCase keys to UPPER_SNAKE_CASE (default: true)
});
```

The returned object exposes three control methods alongside your schema fields:

| Method               | Description                                |
| -------------------- | ------------------------------------------ |
| `$mutate(overrides)` | Override values at runtime                 |
| `$reset()`           | Restore all values to their original state |
| `$load()`            | Eagerly resolve and validate all fields    |

### Field Accessors

Every field returns an accessor object:

| Method          | Available on  | Description                                        |
| --------------- | ------------- | -------------------------------------------------- |
| `$value()`      | Sync fields   | Return the resolved value synchronously            |
| `$resolve()`    | All fields    | Return the resolved value as a Promise             |
| `$refresh()`    | Async fields  | Force re-fetch (secrets / async funcs)             |
| `$versions`     | Secret fields | Version history from the secret manager            |
| `$onChange(cb)` | All fields    | Subscribe to value changes; returns unsubscribe fn |

**Sync fields** (`t.string`, `t.number`, `t.boolean`, `t.date`, `t.url`, `t.duration`, `t.array`, `t.json`, `t.constant`, sync `t.func`) return a `SyncAccessor<T>` that supports both `$value()` and `$resolve()`.

**Async fields** (`t.secret`, async `t.func`, `t.template` referencing async fields) return an `AsyncAccessor<T>` — use `$resolve()`.

### Field Types

#### `t.string(options?)`

Reads a string from the environment.

```typescript
SERVICE_NAME: t.string({ default: "api" }),
```

| Option    | Type     | Description                          |
| --------- | -------- | ------------------------------------ |
| `key`     | `string` | Override the env var key             |
| `default` | `string` | Fallback when the env var is missing |

#### `t.number(options?)`

Reads and coerces a number from the environment.

```typescript
PORT: t.number({ default: 3000 }),
```

#### `t.boolean(options?)`

Reads a boolean. Truthy strings: `"true"`, `"1"`, `"yes"`, `"on"`.

```typescript
DEBUG: t.boolean({ default: false }),
```

#### `t.date(options?)`

Reads and parses a date string. Supported formats: ISO 8601, `YYYY-MM-DD`, `YYYY-MM`, `YYYY`.

```typescript
RELEASE_DATE: t.date(),
```

#### `t.url(options?)`

Reads and validates a URL string.

```typescript
API_ENDPOINT: t.url({ default: "https://api.example.com" }),
```

#### `t.duration(options?)`

Reads a human-readable duration string (`"5m"`, `"2h30m"`, `"1d"`) and returns milliseconds as a number.

```typescript
CACHE_TTL: t.duration({ default: "5m" }),
```

#### `t.array(itemType, options?)`

Reads a comma-separated list and parses each item with `itemType`.

```typescript
ALLOWED_ORIGINS: t.array(t.string(), { default: ["localhost"] }),
```

#### `t.json(options?)`

Reads and parses a JSON string.

```typescript
FEATURE_FLAGS: t.json<{ dark_mode: boolean }>(),
```

#### `t.constant(value)`

A fixed value, independent of environment variables.

```typescript
VERSION: t.constant("1.0.0"),
```

#### `t.func(fn)`

A field whose value is computed by a function. The function receives `{ values }` — a proxy to all other settings fields.

```typescript
DB_URL: t.func(({ values }) =>
  `postgresql://${values.DB_HOST.$value()}:${values.DB_PORT.$value()}/mydb`
),
```

Async functions make the field async — access via `$resolve()`.

```typescript
GREETING: t.func(async ({ values }) => {
  const name = await values.NAME.$resolve();
  return `Hello, ${name}!`;
}),
```

#### `t.template(pattern)`

Interpolates other field values using `{KEY}` syntax. Nested group fields use `{GROUP.FIELD}`.

```typescript
BASE_URL: t.template("https://{HOST}:{PORT}/api"),
DB_URL:   t.template("postgresql://{DB.HOST}:{DB.PORT}/mydb"),
```

Resolves asynchronously if any referenced field is async — use `$resolve()`.

#### `t.object(fields)`

Groups related fields under a namespace. The env var key for a nested field is `{PREFIX}{GROUP_KEY}_{FIELD_KEY}`.

```typescript
const settings = defineSettings({
  DB: t.object({
    HOST: t.string({ default: "localhost" }),
    PORT: t.number({ default: 5432 }),
    NAME: t.string(),
  }),
});

settings.DB.HOST.$value(); // reads DB_HOST
settings.DB.PORT.$value(); // reads DB_PORT
```

#### `t.secret(options)`

Fetches a secret from a secret manager. The env var value is the **name** of the secret in the manager. Responses are cached with a configurable TTL.

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

| Option    | Type                      | Description                                        |
| --------- | ------------------------- | -------------------------------------------------- |
| `adapter` | `SecretAdapter \| string` | Adapter instance or registered adapter name        |
| `schema`  | `SettingsSchema`          | Schema for parsing the secret's JSON value         |
| `ttl`     | `string \| number`        | Cache TTL (duration string or ms). Default: `"1h"` |
| `key`     | `string`                  | Override the env var key for the secret name       |

Access via `$resolve()`:

```typescript
const creds = await settings.DB_CREDENTIALS.$resolve();
console.log(creds.host.$value());
```

Force-refresh a cached secret:

```typescript
await settings.DB_CREDENTIALS.$refresh();
```

#### `t.zodSchema(schema, options?)`

Validates the field value with a Zod schema (requires `zod` peer dependency).

```typescript
import { z } from "zod";

CONFIG: t.zodSchema(z.object({ debug: z.boolean() })),
```

#### `t.valibotSchema(schema, options?)`

Validates the field value with a Valibot schema (requires `valibot` peer dependency).

```typescript
import * as v from "valibot";

CONFIG: t.valibotSchema(v.object({ debug: v.boolean() })),
```

## Secret Adapters

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

### Named Adapter Registry

Register an adapter globally to reference it by name in any `t.secret()` call.

```typescript
import { registerAdapter } from "@odoku-lab/settings";

registerAdapter("production", AWSSecretsManager({ region: "us-east-1" }));

const settings = defineSettings({
  API_KEY: t.secret({ adapter: "production" }),
});
```

## Eager Validation with `$load()`

Call `$load()` at startup to resolve and validate every field upfront. Any missing or invalid values throw a `SettingsValidationError`.

```typescript
const settings = defineSettings({
  PORT:    t.number(),
  DB_HOST: t.string(),
});

await settings.$load();
```

## Mutation and Reset

Override values at runtime — useful for tests or feature flags.

```typescript
settings.$mutate({ PORT: 9000 });
console.log(settings.PORT.$value()); // 9000

settings.$reset();
console.log(settings.PORT.$value()); // original value
```

A frozen settings object rejects mutations:

```typescript
const settings = defineSettings(schema, { frozen: true });
settings.$mutate({ PORT: 9000 }); // throws FrozenSettingsError
```

## Change Tracking

```typescript
const unsubscribe = settings.PORT.$onChange((newValue, oldValue) => {
  console.log(`PORT changed from ${oldValue} to ${newValue}`);
});

settings.$mutate({ PORT: 9000 }); // triggers callback

unsubscribe();
```

## `changeCase` Option

When `changeCase: true` (the default), camelCase schema keys are automatically converted to `UPPER_SNAKE_CASE` env var names.

```typescript
const settings = defineSettings({
  dbHost: t.string({ default: "localhost" }), // reads DB_HOST
  apiKey: t.string(),                          // reads API_KEY
});
```

## Error Handling

| Error class               | When thrown                                                  |
| ------------------------- | ------------------------------------------------------------ |
| `MissingEnvError`         | Required env var is not set                                  |
| `InvalidValueError`       | Value fails type coercion or schema validation               |
| `SchemaDefinitionError`   | Template references a non-existent field                     |
| `SettingsValidationError` | Aggregated error from `$load()` — contains `.errors` array   |
| `FrozenSettingsError`     | `$mutate()` or `$reset()` called on a frozen settings object |
| `SettingsError`           | Base class for all settings errors                           |

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

## Type Utilities

```typescript
import type { InferSettings, InferRawSettings, InferValue } from "@odoku-lab/settings";

const schema = {
  PORT: t.number({ default: 3000 }),
  HOST: t.string({ default: "localhost" }),
};

type AppSettings    = InferSettings<typeof schema>;    // { PORT: SyncAccessor<number>; HOST: SyncAccessor<string> }
type RawSettings    = InferRawSettings<typeof schema>; // raw accessor types
type PortValue      = InferValue<typeof schema.PORT>;  // number
```

## License

MIT
