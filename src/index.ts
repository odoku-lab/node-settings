import { SchemaDefinitionError } from "./errors.js";
import { buildStore } from "./resolver.js";
import { createSettingsProxy, type DeepPartial } from "./settings.js";
import type { EnvSource, InferSettings, SettingsSchema } from "./types/core.js";
import _types from "./types/index.js";

export * from "./adapters/index.js";
export {
  FrozenSettingsError,
  InvalidValueError,
  MissingEnvError,
  SchemaDefinitionError,
  SettingsError,
  SettingsValidationError,
} from "./errors.js";
export { getAdapter, hasAdapter, registerAdapter } from "./secret.js";
export type {
  AsyncAccessor,
  InferRawSettings,
  InferSettings,
  SettingsSchema,
  SyncAccessor,
  TypeDef,
} from "./types/core.js";
export type { SecretOptions } from "./types/secret.js";
export type { DeepPartial };
export const types = _types;

// Method names starting with $ are reserved by the schema
const RESERVED_SCHEMA_KEYS = new Set(["$mutate", "$reset", "$load"]);

type MutableSettings<T> = T & {
  $mutate(overrides: DeepPartial<T>): void;
  $reset(): void;
  $load(): Promise<void>;
};

export interface SettingsOptions {
  prefix?: string;
  source?: Record<string, string | undefined>;
  frozen?: boolean;
  maskSecrets?: boolean;
  changeCase?: boolean;
}

/**
 * Generates a type-safe settings object from a schema (synchronous).
 * All fields are resolved lazily on `$value()` call.
 * The return value includes `$mutate()`, `$reset()`, and `$load()` methods.
 * - `$mutate(overrides)` — temporarily overrides settings values
 * - `$reset()` — restores mutated values to their originals
 * - `$load()` — eagerly resolves and validates all fields (optional)
 *
 * @param schema - Schema containing field definitions
 * @param options.prefix - Prefix applied to environment variable keys (default: `""`)
 * @param options.source - Environment variable source (default: `process.env`)
 * @param options.frozen - When true, disables mutate/reset
 * @param options.maskSecrets - Whether to mask error messages for secret-related fields (default: true)
 * @param options.changeCase - Whether to convert schema keys to UPPER_SNAKE_CASE (default: true)
 */
export function defineSettings<const T extends SettingsSchema>(
  schema: T,
  options: SettingsOptions = {},
): MutableSettings<InferSettings<T>> {
  const {
    prefix = "",
    source: explicitSource,
    frozen = false,
    maskSecrets = true,
    changeCase = true,
  } = options;

  for (const key of Object.keys(schema)) {
    if (RESERVED_SCHEMA_KEYS.has(key)) {
      throw new SchemaDefinitionError(
        `Schema key "${key}" conflicts with a reserved settings method name`,
      );
    }
  }

  /* c8 ignore start */
  // biome-ignore lint/suspicious/noExplicitAny: browser env fallback unreachable in Node.js
  const processEnv: EnvSource = (globalThis as any).process?.env ?? {};
  /* c8 ignore stop */
  const envSource: EnvSource = explicitSource ? { ...explicitSource } : processEnv;

  const store = buildStore(
    schema as Record<string, unknown>,
    prefix,
    envSource,
    maskSecrets,
    changeCase,
  );

  return createSettingsProxy<InferSettings<T>>(store, frozen) as MutableSettings<InferSettings<T>>;
}
