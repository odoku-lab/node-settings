# @odoku-lab/settings

[![CI](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个适用于 Node.js 和 TypeScript 的类型安全设置加载器。通过单一模式定义读取环境变量、常量和模板，返回完全类型推断的设置对象。

## 安装

```bash
npm install @odoku-lab/settings
# 或
pnpm add @odoku-lab/settings
```

如需与 Zod 或 valibot 配合使用，请分别安装：

```bash
npm install zod
npm install valibot
```

## 特性

- **类型安全** — 返回值类型从模式定义自动推断
- **错误聚合** — 验证所有字段后统一报告，而非在第一个错误处停止
- **模板** — 使用 `{KEY}` 语法引用其他字段的解析值
- **嵌套分组** — 按层次结构组织设置
- **无副作用** — 指定 `envFile` 时不会污染 `process.env`
- **支持 Zod / valibot** — 可接入任意模式验证库

## 基本用法

```typescript
import { fields, loadSettings } from "@odoku-lab/settings"

const settings = loadSettings({
  DEBUG:   fields.Boolean({ default: false }),
  PORT:    fields.Number({ default: 3000 }),
  API_URL: fields.String(),                          // 必填
  WEBHOOK: fields.String({ optional: true }),        // 可选 → string | undefined
}, {
  prefix:  "APP_",   // 读取 APP_DEBUG, APP_PORT ...
  envFile: ".env",   // 可选。仅在指定时读取 .env
})

settings.DEBUG    // boolean
settings.PORT     // number
settings.API_URL  // string
settings.WEBHOOK  // string | undefined
```

## 字段工厂

所有字段均从 `import { fields } from "@odoku-lab/settings"` 导入。

### fields.String

```typescript
fields.String()                                       // 必填, string
fields.String({ default: "localhost" })               // 带默认值
fields.String({ optional: true })                     // 可选, string | undefined
fields.String({ key: "DB_HOST" })                     // 覆盖键名
fields.String({ regex: /^[a-z0-9]+$/ })              // 正则表达式验证
fields.String({ options: ["dev", "prod"] as const })  // 允许值枚举 → "dev" | "prod"
```

### fields.Number

```typescript
fields.Number()                                       // 必填, number
fields.Number({ default: 3000 })                      // 带默认值
fields.Number({ options: [80, 443, 8080] as const })  // 允许值枚举 → 80 | 443 | 8080
```

### fields.Boolean

比较时不区分大小写（可识别 `"TRUE"`、`"True"` 等）。

```typescript
fields.Boolean()                                          // 必填, boolean
fields.Boolean({ default: false })                        // 带默认值
fields.Boolean({ trueValues: ["on", "enabled"] })         // 视为真的字符串（默认: "true", "1", "yes"）
fields.Boolean({ falseValues: ["off", "disabled"] })      // 视为假的字符串（默认: "false", "0", "no"）
fields.Boolean({ allowUnrecognized: false })              // 对既不真也不假的值抛出错误
```

### fields.Date

```typescript
fields.Date()                                         // 解析 ISO 8601 字符串 → Date
fields.Date({ format: "yyyy-MM-dd" })                 // 使用 date-fns 格式解析
```

### fields.Array

```typescript
fields.Array()                                        // 逗号分隔字符串 → string[]
fields.Array({ type: fields.Number() })                    // 转换每个元素 → number[]
fields.Array({ type: fields.String(), delimiter: "|" })    // 自定义分隔符
fields.Array({ default: [] })                         // 带默认值
```

空字符串环境变量（`TAGS=""`）被视为空数组 `[]`。

### fields.Json

```typescript
fields.Json()                                         // JSON.parse → unknown
fields.Json<{ port: number }>()                       // 使用类型参数缩小类型
```

### fields.ZodSchema

直接使用 Zod 模式。通过 Zod 的 `.default()` 设置默认值。指定 `optional: true` 可在环境变量未设置时返回 `undefined`。

```typescript
import { z } from "zod"
import { fields } from "@odoku-lab/settings"

fields.ZodSchema({ schema: z.coerce.number().int().min(1).max(65535) })
fields.ZodSchema({ schema: z.coerce.number().default(3000) })
fields.ZodSchema({ schema: z.string().email() })
fields.ZodSchema({ schema: z.string(), optional: true })  // 未设置时返回 undefined
```

### fields.ValibotSchema

直接使用 valibot 模式。兼容 Standard Schema v1 的任何模式均可工作。指定 `optional: true` 可在环境变量未设置时返回 `undefined`。

```typescript
import * as v from "valibot"
import { fields } from "@odoku-lab/settings"

fields.ValibotSchema({ schema: v.pipe(v.string(), v.transform(Number), v.number()) })
fields.ValibotSchema({ schema: v.fallback(v.pipe(v.string(), v.transform(Number), v.number()), 3000) })
fields.ValibotSchema({ schema: v.string(), optional: true })  // 未设置时返回 undefined
```

### fields.Template

使用 `{KEY}` / `{GROUP.KEY}` 语法引用其他字段的解析值。

```typescript
fields.Template("postgresql://{HOST}:{PORT}/mydb")
fields.Template("https://{DATABASE.HOST}:{DATABASE.PORT}/api")
```

## 通用选项

大多数字段工厂接受以下选项：

| 选项                    | 说明                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `key`                   | 环境变量键名。省略时默认为模式中的字段名 + prefix          |
| `key: { name, prefix }` | 使用对象形式可单独覆盖 prefix                              |
| `default`               | 环境变量未设置时的默认值                                   |
| `optional: true`        | 未设置时返回 `undefined` 而不是抛出错误                    |

## 常量字段

不读取环境变量，直接按原样返回值。支持原始类型、Date、数组和对象。

```typescript
const s = loadSettings({
  SECRET: "my-secret",          // 类型: "my-secret"
  VERSION: 2,                   // 类型: 2
  FLAG: true,                   // 类型: true
  TAGS: ["a", "b"] as const,   // 类型: readonly ["a", "b"]
  TODAY: new Date(),            // 类型: Date
  META: { host: "localhost" },  // 类型: { host: string }（原样返回）
})
```

## 嵌套分组

包含 `fields.*` 字段的对象将作为分组递归解析。

```typescript
const s = loadSettings({
  DATABASE: {
    HOST: fields.String({ key: { name: "DB_HOST", prefix: "" } }),
    PORT: fields.Number({ key: { name: "DB_PORT", prefix: "" } }),
    URL:  fields.Template("postgresql://{DATABASE.HOST}:{DATABASE.PORT}/mydb"),
  },
})

s.DATABASE.HOST  // string
s.DATABASE.PORT  // number
s.DATABASE.URL   // "postgresql://pg.example.com:5432/mydb"
```

## prefix 和键名覆盖

`prefix` 会前置到所有环境变量键名之前。若要为特定字段使用不同的 prefix，请使用对象形式指定 `key`。

```typescript
loadSettings({
  PORT: fields.Number(),                                          // → APP_PORT
  HOST: fields.String({ key: { name: "DB_HOST", prefix: "" } }), // → DB_HOST（忽略 prefix）
}, { prefix: "APP_" })
```

## 错误处理

`loadSettings` 先验证所有字段，然后统一抛出包含所有错误的单个 `SettingsValidationError`。

```typescript
import {
  loadSettings,
  SettingsValidationError,
  MissingEnvError,
  InvalidValueError,
} from "@odoku-lab/settings"

try {
  const s = loadSettings({ /* ... */ })
} catch (e) {
  if (e instanceof SettingsValidationError) {
    for (const err of e.errors) {
      if (err instanceof MissingEnvError)   console.error("缺失:", err.fieldName)
      if (err instanceof InvalidValueError) console.error("无效:", err.fieldName)
    }
  }
}
```

| 错误类                    | 触发条件                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `SettingsError`           | 所有错误的基类                                                   |
| `MissingEnvError`         | 必填环境变量未设置                                               |
| `InvalidValueError`       | 类型转换或验证失败                                               |
| `SchemaDefinitionError`   | 模式定义错误（如模板引用目标不存在、异步模式等）                 |
| `SettingsValidationError` | 一个或多个字段验证失败（单个错误存放在 `.errors` 中）            |

## 注意事项

- **空字符串环境变量** — 当环境变量设置为空字符串（如 `APP_PORT=""`）时，将被视为"有值"，不使用 `default`。对于需要类型转换的字段（如 `number`），会导致 `InvalidValueError`。例外：`fields.Array` 将空字符串视为空数组 `[]`。
- **`envFile` 与 `process.env`** — `envFile` 的内容仅在本地读取，不会修改 `process.env`。已有的 `process.env` 值优先于 `envFile`。
- **模板与错误聚合** — 如果模板引用的字段解析失败（如 `MissingEnvError`），该模板将被跳过。当 Pass 1 的错误解决后，Pass 2 的模板将正常求值。
