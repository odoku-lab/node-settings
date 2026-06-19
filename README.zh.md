# @odoku-lab/settings

[![CI](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

适用于 Node.js 和 TypeScript 的类型安全环境变量 / 配置加载器。只需定义一次模式，即可获得带有完整类型推断的懒加载配置对象。

- **懒加载** — 所有字段通过 `$value()` / `$resolve()` 按需解析
- **密钥管理** — 内置 TTL 缓存及 AWS、Azure、GCP、HashiCorp Vault 适配器
- **嵌套分组** — 使用 `t.object()` 组织相关配置
- **变更与重置** — 无需修改 `process.env` 即可在运行时覆盖值
- **模式验证** — 支持接入 Zod 或 Valibot
- **变更追踪** — 使用 `$onChange()` 订阅值的变化

## 安装

```bash
npm install @odoku-lab/settings
```

## 快速开始

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

const settings = defineSettings({
  PORT:     t.number({ default: 3000 }),
  HOST:     t.string({ default: "localhost" }),
  DEBUG:    t.boolean({ default: false }),
  BASE_URL: t.template("http://{HOST}:{PORT}"),
});

// 同步字段使用 $value()
console.log(settings.PORT.$value());   // 3000
console.log(settings.DEBUG.$value());  // false

// 异步字段使用 $resolve()
console.log(await settings.BASE_URL.$resolve()); // "http://localhost:3000"
```

## API 参考

### `defineSettings(schema, options?)`

从模式对象创建类型安全的配置代理。

```typescript
const settings = defineSettings(schema, {
  prefix:      "APP_",   // 所有环境变量键的前缀 (默认: "")
  source:      {},       // 使用自定义对象替代 process.env
  frozen:      false,    // 禁用 $mutate / $reset (默认: false)
  maskSecrets: true,     // 在错误消息中掩码值 (默认: true)
  changeCase:  true,     // 将 camelCase 键转换为 UPPER_SNAKE_CASE (默认: true)
});
```

返回对象除了模式字段外，还包含以下控制方法：

| 方法                 | 说明                   |
| -------------------- | ---------------------- |
| `$mutate(overrides)` | 在运行时覆盖值         |
| `$reset()`           | 将所有值恢复为原始状态 |
| `$load()`            | 立即解析并验证所有字段 |

### 字段访问器

每个字段都返回一个访问器对象：

| 方法            | 可用字段 | 说明                             |
| --------------- | -------- | -------------------------------- |
| `$value()`      | 同步字段 | 同步返回解析后的值               |
| `$resolve()`    | 所有字段 | 以 Promise 形式返回解析后的值    |
| `$refresh()`    | 异步字段 | 强制重新获取（密钥 / 异步 func） |
| `$versions`     | 密钥字段 | 密钥管理器的版本历史             |
| `$onChange(cb)` | 所有字段 | 订阅值变化；返回取消订阅函数     |

**同步字段** (`t.string`、`t.number`、`t.boolean`、`t.date`、`t.url`、`t.duration`、`t.array`、`t.json`、`t.constant`、同步 `t.func`) 返回 `SyncAccessor<T>`，支持 `$value()` 和 `$resolve()`。

**异步字段** (`t.secret`、异步 `t.func`、引用异步字段的 `t.template`) 返回 `AsyncAccessor<T>` — 请使用 `$resolve()`。

### 字段类型

#### `t.string(options?)`

从环境变量读取字符串。

```typescript
SERVICE_NAME: t.string({ default: "api" }),
```

| 选项      | 类型     | 说明                   |
| --------- | -------- | ---------------------- |
| `key`     | `string` | 覆盖环境变量键         |
| `default` | `string` | 环境变量缺失时的回退值 |

#### `t.number(options?)`

从环境变量读取并强制转换数字。

```typescript
PORT: t.number({ default: 3000 }),
```

#### `t.boolean(options?)`

读取布尔值。真值字符串：`"true"`、`"1"`、`"yes"`、`"on"`。

```typescript
DEBUG: t.boolean({ default: false }),
```

#### `t.date(options?)`

读取并解析日期字符串。支持格式：ISO 8601、`YYYY-MM-DD`、`YYYY-MM`、`YYYY`。

```typescript
RELEASE_DATE: t.date(),
```

#### `t.url(options?)`

读取并验证 URL 字符串。

```typescript
API_ENDPOINT: t.url({ default: "https://api.example.com" }),
```

#### `t.duration(options?)`

读取人类可读的时长字符串（`"5m"`、`"2h30m"`、`"1d"`），以毫秒数值返回。

```typescript
CACHE_TTL: t.duration({ default: "5m" }),
```

#### `t.array(itemType, options?)`

读取逗号分隔的列表，并用 `itemType` 解析每个元素。

```typescript
ALLOWED_ORIGINS: t.array(t.string(), { default: ["localhost"] }),
```

#### `t.json(options?)`

读取并解析 JSON 字符串。

```typescript
FEATURE_FLAGS: t.json<{ dark_mode: boolean }>(),
```

#### `t.constant(value)`

定义与环境变量无关的固定值。

```typescript
VERSION: t.constant("1.0.0"),
```

#### `t.func(fn)`

值由函数计算得出的字段。函数接收 `{ values }` — 所有其他配置字段的代理。

```typescript
DB_URL: t.func(({ values }) =>
  `postgresql://${values.DB_HOST.$value()}:${values.DB_PORT.$value()}/mydb`
),
```

传入异步函数时字段变为异步（使用 `$resolve()`）。

```typescript
GREETING: t.func(async ({ values }) => {
  const name = await values.NAME.$resolve();
  return `Hello, ${name}!`;
}),
```

#### `t.template(pattern)`

使用 `{KEY}` 语法插入其他字段的值。嵌套分组字段使用 `{GROUP.FIELD}` 引用。

```typescript
BASE_URL: t.template("https://{HOST}:{PORT}/api"),
DB_URL:   t.template("postgresql://{DB.HOST}:{DB.PORT}/mydb"),
```

若引用的字段为异步，模板也将变为异步（使用 `$resolve()`）。

#### `t.object(fields)`

将相关字段组织在命名空间下。嵌套字段的环境变量键为 `{PREFIX}{GROUP_KEY}_{FIELD_KEY}`。

```typescript
const settings = defineSettings({
  DB: t.object({
    HOST: t.string({ default: "localhost" }),
    PORT: t.number({ default: 5432 }),
    NAME: t.string(),
  }),
});

settings.DB.HOST.$value(); // 读取 DB_HOST
settings.DB.PORT.$value(); // 读取 DB_PORT
```

#### `t.secret(options)`

从密钥管理器获取密钥。环境变量的值用作管理器中的**密钥名称**。响应通过可配置的 TTL 进行缓存。

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

| 选项      | 类型                      | 说明                                         |
| --------- | ------------------------- | -------------------------------------------- |
| `adapter` | `SecretAdapter \| string` | 适配器实例或已注册的适配器名称               |
| `schema`  | `SettingsSchema`          | 用于解析密钥 JSON 值的模式                   |
| `ttl`     | `string \| number`        | 缓存 TTL（时长字符串或毫秒数）。默认：`"1h"` |
| `key`     | `string`                  | 覆盖密钥名称的环境变量键                     |

通过 `$resolve()` 访问：

```typescript
const creds = await settings.DB_CREDENTIALS.$resolve();
console.log(creds.host.$value());
```

强制刷新缓存的密钥：

```typescript
await settings.DB_CREDENTIALS.$refresh();
```

#### `t.zodSchema(schema, options?)`

使用 Zod 模式验证字段值（需要 `zod` peer dependency）。

```typescript
import { z } from "zod";

CONFIG: t.zodSchema(z.object({ debug: z.boolean() })),
```

#### `t.valibotSchema(schema, options?)`

使用 Valibot 模式验证字段值（需要 `valibot` peer dependency）。

```typescript
import * as v from "valibot";

CONFIG: t.valibotSchema(v.object({ debug: v.boolean() })),
```

## 密钥适配器

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

### 命名适配器注册表

全局注册适配器，在任何 `t.secret()` 调用中通过名称引用。

```typescript
import { registerAdapter } from "@odoku-lab/settings";

registerAdapter("production", AWSSecretsManager({ region: "us-east-1" }));

const settings = defineSettings({
  API_KEY: t.secret({ adapter: "production" }),
});
```

## 使用 `$load()` 进行提前验证

在应用启动时调用 `$load()`，可以提前解析并验证所有字段。如有缺失或无效的值，将抛出 `SettingsValidationError`。

```typescript
const settings = defineSettings({
  PORT:    t.number(),
  DB_HOST: t.string(),
});

await settings.$load();
```

## 变更与重置

在运行时覆盖值，适用于测试或功能标志。

```typescript
settings.$mutate({ PORT: 9000 });
console.log(settings.PORT.$value()); // 9000

settings.$reset();
console.log(settings.PORT.$value()); // 原始值
```

冻结的配置对象会拒绝变更：

```typescript
const settings = defineSettings(schema, { frozen: true });
settings.$mutate({ PORT: 9000 }); // 抛出 FrozenSettingsError
```

## 变更追踪

```typescript
const unsubscribe = settings.PORT.$onChange((newValue, oldValue) => {
  console.log(`PORT 从 ${oldValue} 变更为 ${newValue}`);
});

settings.$mutate({ PORT: 9000 }); // 触发回调

unsubscribe();
```

## `changeCase` 选项

当 `changeCase: true`（默认值）时，camelCase 的模式键会自动转换为 `UPPER_SNAKE_CASE` 的环境变量名。

```typescript
const settings = defineSettings({
  dbHost: t.string({ default: "localhost" }), // 读取 DB_HOST
  apiKey: t.string(),                          // 读取 API_KEY
});
```

## 错误处理

| 错误类                    | 抛出时机                                    |
| ------------------------- | ------------------------------------------- |
| `MissingEnvError`         | 必填环境变量未设置                          |
| `InvalidValueError`       | 值的类型转换或模式验证失败                  |
| `SchemaDefinitionError`   | 模板引用了不存在的字段                      |
| `SettingsValidationError` | `$load()` 的聚合错误 — 包含 `.errors` 数组  |
| `FrozenSettingsError`     | 对冻结配置对象调用 `$mutate()` / `$reset()` |
| `SettingsError`           | 所有配置错误的基类                          |

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

## 类型工具

```typescript
import type { InferSettings, InferRawSettings, InferValue } from "@odoku-lab/settings";

const schema = {
  PORT: t.number({ default: 3000 }),
  HOST: t.string({ default: "localhost" }),
};

type AppSettings = InferSettings<typeof schema>;    // { PORT: SyncAccessor<number>; HOST: SyncAccessor<string> }
type RawSettings = InferRawSettings<typeof schema>; // 原始访问器类型
type PortValue   = InferValue<typeof schema.PORT>;  // number
```

## 许可证

MIT
