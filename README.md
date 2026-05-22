# @odoku-lab/settings

[![CI](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/odoku-lab/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe settings loader for Node.js and TypeScript. Reads environment variables, constants, and templates from a single schema definition and returns a fully typed settings object.

## Installation

```bash
npm install @odoku-lab/settings
# or
pnpm add @odoku-lab/settings
```

To use with Zod or valibot, install them separately:

```bash
npm install zod
npm install valibot
```

## Features

- **Type-safe** — return type is automatically inferred from the schema definition
- **Error aggregation** — validates all fields and reports errors together instead of stopping at the first failure
- **Templates** — reference resolved values from other fields using `{KEY}` syntax
- **Nested groups** — organize settings in a hierarchical structure
- **No side effects** — `envFile` does not pollute `process.env`
- **Zod / valibot support** — plug in any schema validation library

## Basic Usage

```typescript
import { fields, loadSettings } from "@odoku-lab/settings"

const settings = loadSettings({
  DEBUG:   fields.Boolean({ default: false }),
  PORT:    fields.Number({ default: 3000 }),
  API_URL: fields.String(),                          // required
  WEBHOOK: fields.String({ optional: true }),        // optional → string | undefined
}, {
  prefix:  "APP_",   // reads APP_DEBUG, APP_PORT ...
  envFile: ".env",   // optional. only reads .env when specified
})

settings.DEBUG    // boolean
settings.PORT     // number
settings.API_URL  // string
settings.WEBHOOK  // string | undefined
```

## Field Factories

All fields are imported from `import { fields } from "@odoku-lab/settings"`.

### fields.String

```typescript
fields.String()                                       // required, string
fields.String({ default: "localhost" })               // with default value
fields.String({ optional: true })                     // optional, string | undefined
fields.String({ key: "DB_HOST" })                     // override key name
fields.String({ regex: /^[a-z0-9]+$/ })              // regex validation
fields.String({ options: ["dev", "prod"] as const })  // allowed values → "dev" | "prod"
```

### fields.Number

```typescript
fields.Number()                                       // required, number
fields.Number({ default: 3000 })                      // with default value
fields.Number({ options: [80, 443, 8080] as const })  // allowed values → 80 | 443 | 8080
```

### fields.Boolean

Comparison is case-insensitive (recognizes `"TRUE"`, `"True"`, etc.).

```typescript
fields.Boolean()                                          // required, boolean
fields.Boolean({ default: false })                        // with default value
fields.Boolean({ trueValues: ["on", "enabled"] })         // values treated as true (default: "true", "1", "yes")
fields.Boolean({ falseValues: ["off", "disabled"] })      // values treated as false (default: "false", "0", "no")
fields.Boolean({ allowUnrecognized: false })              // throw on values matching neither true nor false
```

### fields.Date

```typescript
fields.Date()                                         // parse ISO 8601 string → Date
fields.Date({ format: "yyyy-MM-dd" })                 // parse with date-fns format
```

### fields.Array

```typescript
fields.Array()                                        // comma-separated string → string[]
fields.Array({ type: fields.Number() })                    // convert each element → number[]
fields.Array({ type: fields.String(), delimiter: "|" })    // custom delimiter
fields.Array({ default: [] })                         // with default value
```

An empty string env var (`TAGS=""`) is treated as an empty array `[]`.

### fields.Json

```typescript
fields.Json()                                         // JSON.parse → unknown
fields.Json<{ port: number }>()                       // narrow with type parameter
```

### fields.ZodSchema

Use a Zod schema directly. Set default values via Zod's `.default()`. Specify `optional: true` to return `undefined` when the env var is not set.

```typescript
import { z } from "zod"
import { fields } from "@odoku-lab/settings"

fields.ZodSchema({ schema: z.coerce.number().int().min(1).max(65535) })
fields.ZodSchema({ schema: z.coerce.number().default(3000) })
fields.ZodSchema({ schema: z.string().email() })
fields.ZodSchema({ schema: z.string(), optional: true })  // undefined when unset
```

### fields.ValibotSchema

Use a valibot schema directly. Works with any schema compliant with Standard Schema v1. Specify `optional: true` to return `undefined` when the env var is not set.

```typescript
import * as v from "valibot"
import { fields } from "@odoku-lab/settings"

fields.ValibotSchema({ schema: v.pipe(v.string(), v.transform(Number), v.number()) })
fields.ValibotSchema({ schema: v.fallback(v.pipe(v.string(), v.transform(Number), v.number()), 3000) })
fields.ValibotSchema({ schema: v.string(), optional: true })  // undefined when unset
```

### fields.Template

Reference resolved values from other fields using `{KEY}` / `{GROUP.KEY}` syntax.

```typescript
fields.Template("postgresql://{HOST}:{PORT}/mydb")
fields.Template("https://{DATABASE.HOST}:{DATABASE.PORT}/api")
```

## Common Options

Most field factories accept the following options:

| Option                  | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `key`                   | Env var key name. Defaults to schema field name + prefix                  |
| `key: { name, prefix }` | Object form to override the prefix individually                           |
| `default`               | Default value used when the env var is not set                            |
| `optional: true`        | Returns `undefined` when unset instead of throwing an error               |

## Constant Fields

Returns the value as-is without reading an environment variable. Works with primitives, Date, arrays, and objects.

```typescript
const s = loadSettings({
  SECRET: "my-secret",          // type: "my-secret"
  VERSION: 2,                   // type: 2
  FLAG: true,                   // type: true
  TAGS: ["a", "b"] as const,   // type: readonly ["a", "b"]
  TODAY: new Date(),            // type: Date
  META: { host: "localhost" },  // type: { host: string } (returned as-is)
})
```

## Nested Groups

Objects containing `fields.*` fields are resolved recursively as groups.

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

## Prefix and Key Overrides

`prefix` is prepended to all env var keys. To use a different prefix for a specific field, specify `key` as an object.

```typescript
loadSettings({
  PORT: fields.Number(),                                          // → APP_PORT
  HOST: fields.String({ key: { name: "DB_HOST", prefix: "" } }), // → DB_HOST (ignores prefix)
}, { prefix: "APP_" })
```

## Error Handling

`loadSettings` validates all fields first, then throws a single `SettingsValidationError` containing all errors.

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
      if (err instanceof MissingEnvError)   console.error("Missing:", err.fieldName)
      if (err instanceof InvalidValueError) console.error("Invalid:", err.fieldName)
    }
  }
}
```

| Error class               | Condition                                                             |
| ------------------------- | --------------------------------------------------------------------- |
| `SettingsError`           | Base class for all errors                                             |
| `MissingEnvError`         | Required env var is not set                                           |
| `InvalidValueError`       | Type conversion or validation failed                                  |
| `SchemaDefinitionError`   | Schema definition error (e.g. missing template target, async schema)  |
| `SettingsValidationError` | One or more field validations failed (individual errors in `.errors`) |

## Notes

- **Empty string env vars** — When an env var is set to an empty string (e.g. `APP_PORT=""`), it is treated as "has a value" and `default` is not used. For types that require conversion (e.g. `number`), this results in `InvalidValueError`. Exception: `fields.Array` treats empty strings as an empty array `[]`.
- **`envFile` and `process.env`** — The contents of `envFile` are read locally without modifying `process.env`. Existing `process.env` values take precedence over `envFile`.
- **Templates and error aggregation** — If a field referenced by a template fails to resolve (e.g. `MissingEnvError`), the template is skipped. Once the Pass 1 errors are resolved, the Pass 2 templates will evaluate correctly.
