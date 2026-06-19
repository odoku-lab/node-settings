# Contributing

Please check the following before submitting a PR.

## Local Verification

```bash
# Install
pnpm install

# Lint & Format
pnpm lint

# Type Check
pnpm typecheck

# Tests
pnpm test

# Build
pnpm build
```

Make sure all checks pass before creating a PR.

## Coding Conventions

- Formatting follows Biome (`pnpm lint`)
- Field type factories live in `src/types/factories.ts` and use camelCase names (e.g. `stringType`, `numberType`). They are exported via the `types` namespace in `src/index.ts` as `t.string()`, `t.number()`, etc.
- Always add tests for new features
- Place tests in the `tests/` directory

## License

This project is licensed under the MIT License. Contributions are made under the same license.
