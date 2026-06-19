# Changelog

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
