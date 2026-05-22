# Contributing

Please check the following before submitting a PR.

## Local Verification

```bash
# Install
pnpm install

# Linter & Formatter
pnpm run lint
pnpm run format

# Type Check
pnpm run typecheck

# Tests
pnpm run test

# Build
pnpm run build
```

Make sure all checks pass before creating a PR.

## Coding Conventions

- Formatting follows Biome (`pnpm run format`)
- Function names in `fields.ts` use a `Type` suffix (e.g. `StringType`) to avoid conflicts with global constructors; short names are aliased via `export const String = StringType`
- Always add tests for new features
- Place tests in the `tests/` directory

## License

This project is licensed under the MIT License. Contributions are made under the same license.
