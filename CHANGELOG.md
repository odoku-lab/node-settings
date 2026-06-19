# Changelog

## 0.2.0 (2026-06-19)

### Features

- **`defineSettings()` replaces `loadSettings()`** — returns a live proxy object with `$mutate()`, `$reset()`, and `$load()` methods for runtime mutation and reload
- **Secret adapters** — fetch secrets from cloud vaults at runtime:
  - `AWSSecretsManager` (requires `@aws-sdk/client-secrets-manager`)
  - `AzureKeyVault` (requires `@azure/keyvault-secrets` and `@azure/identity`)
  - `GCPSecretManager` (requires `@google-cloud/secret-manager`)
  - `VaultKV` — HashiCorp Vault KV v1/v2 with lease tracking (requires `node-vault`)
- **`t.secret()`** type factory — defines a field backed by a secret adapter, with optional TTL caching and JSON sub-schema support
- **`t.func()`** type factory — defines an async computed field with TTL caching, `$refresh`, `$onChange`, and `$versions` hooks
- **`t.object()`** type factory — groups fields under a shared env-variable prefix
- **`t.url()`** type factory — validates and parses URL values
- **`t.duration()`** type factory — parses duration strings (e.g. `"5m"`, `"1h"`) into milliseconds
- **Adapter registry** — `registerAdapter()`, `getAdapter()`, `hasAdapter()` for global adapter management
- **`frozen` option** for `defineSettings()` — disables `$mutate`/`$reset`, throwing `FrozenSettingsError`
- **`maskSecrets` option** for `defineSettings()` — masks secret values in error messages (default: `true`)
- **`changeCase` option** for `defineSettings()` — controls automatic key conversion to `UPPER_SNAKE_CASE` (default: `true`)
- **`source` option** for `defineSettings()` — custom environment variable source (replaces `process.env`)
- **`FrozenSettingsError`** — new error class thrown when mutating frozen settings
- **`InvalidValueError.forField()` / `InvalidValueError.forMessage()`** — static factory methods replacing the constructor (breaking change)
- **Docusaurus documentation site** — added comprehensive docs in `docs/`

### Breaking Changes

- `loadSettings()` is removed; use `defineSettings()` instead (returns a proxy, not a plain object)
- `fields` export is replaced by `types` (`t` namespace); field factory names changed:
  - `fields.String` → `t.string`
  - `fields.Number` → `t.number`
  - `fields.Boolean` → `t.boolean`
  - `fields.Date` → `t.date`
  - `fields.Array` → `t.array`
  - `fields.Json` → `t.json`
  - `fields.Template` → `t.template`
- `InvalidValueError` constructor is now private; use `InvalidValueError.forField()` or `InvalidValueError.forMessage()`
- `FieldDef` / `EnvKey` types removed; replaced by `TypeDef` and the new type system
- `InferSettings<T>` now infers async fields as accessor types (`SyncAccessor<T>` / `AsyncAccessor<T>`)

### Dependency Updates

- Bumped `dotenv` (production)
- Bumped `pnpm/action-setup` v4 → v6, `actions/checkout` v4 → v6, `actions/setup-node` v4 → v6 (CI)
- Bumped dev dependencies (vitest, biome, typescript)
- CI now tests against Node.js 22 and 24

## 0.1.0 (2026-05-22)

### Features

- Initial public release
- Field factories: `String`, `Number`, `Boolean`, `Date`, `Array`, `Json`, `Template`
- Schema adapter support: `ZodSchema`, `ValibotSchema` (Standard Schema v1)
- `defineSettings()` with error aggregation across all fields
- Nested group support
- Constant field support (plain values in schema)
- Env file support (no `process.env` pollution)
- Template resolution with `{KEY}` / `{GROUP.KEY}` syntax
- TypeScript-first: full type inference from schema definitions
