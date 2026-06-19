import { MissingEnvError } from "../errors.js";

export const TYPE_BRAND = Symbol("TypeDef");
export type EnvSource = Record<string, string | undefined>;

export type ResolveCtx<V = ValuesProxy> = {
  raw: string | undefined;
  source: EnvSource;
  /**
   * Proxy for accessing other fields from func/template.
   * Sync fields are accessed via `$value()` and async fields via `$resolve()`.
   * Group fields return a Proxy of the same shape.
   * Pass the schema type via type parameter V for type-safe access (default is a loose type).
   */
  values: V;
  /** Environment variable key for a secret cell (e.g. "INFRA_DB"). Used as the prefix for env var overrides when resolving the secret's schema. */
  envKey?: string;
  resolve?: (
    schema: Record<string, unknown>,
    base: Record<string, unknown>,
    envPrefix?: string,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

export type TypeDef<T> = {
  readonly [TYPE_BRAND]: true;
  readonly key?: string;
  readonly prefix?: string;
  readonly _resolve: (ctx: ResolveCtx) => T | Promise<T>;
  readonly _schema?: SettingsSchema;
  /** Flag set only by t.object(). Used by resolver.ts to recursively resolve child fields. */
  readonly _objectType?: true;
  /** Prefix override for t.object(). Used by resolver.ts when building environment variable keys for child fields. */
  readonly _objectPrefix?: string;
  /** Schema type information for t.object(). Used by InferValue to accurately infer the return type of $value()/$resolve(). */
  readonly _objectSchema?: SettingsSchema;
  /** TTL cache configuration for func/secret */
  readonly _cache?: { ttl?: number };
  /** Flag indicating that _resolve returns a Promise (async field). */
  readonly _async?: true;
  /** Flag for t.template(). Used by InferValue to return both SyncAccessor & AsyncAccessor. */
  readonly _templateType?: true;
};

/** Type guard that checks whether a value is a `TypeDef`, identified by the presence of the `TYPE_BRAND` symbol. */
export function isType(v: unknown): v is TypeDef<unknown> {
  return typeof v === "object" && v !== null && TYPE_BRAND in v;
}

export type SettingsSchema = Record<string, unknown>;

/** Accessor for synchronous fields */
export type SyncAccessor<T> = {
  $value(): T;
  $versions: string[];
  $onChange(cb: (next: T, prev: T | undefined) => void): () => void;
};

/** Accessor for asynchronous fields */
export type AsyncAccessor<T> = {
  $resolve(): Promise<T>;
  $refresh(): Promise<T>;
  $versions: string[];
  $onChange(cb: (next: T, prev: T | undefined) => void): () => void;
};

/**
 * Field accessor type used in the values context of func/template.
 * Both sync and async fields can be accessed via $value() and $resolve().
 * $resolve() on a sync field returns the value wrapped in Promise.resolve().
 */
export type ValuesAccessor<T = unknown> = {
  $value(): T;
  $resolve(): Promise<T>;
  $refresh(): Promise<T>;
  $versions: string[];
  $onChange(cb: (next: T, prev: T | undefined) => void): () => void;
};

/**
 * Proxy type for the values context.
 * Provides both field accessors ($value/$resolve, etc.) and group access (nested keys).
 */
export type ValuesProxy = ValuesAccessor<unknown> & {
  [key: string]: ValuesProxy;
};

/**
 * Recursively transforms object child fields with InferValue.
 * Excludes method names starting with `$`, and passes through fields already of type SyncAccessor / AsyncAccessor (prevents double-wrapping).
 */
type NestedFields<T extends object> = {
  [K in keyof T as K extends `$${string}` ? never : K]: T[K] extends
    | SyncAccessor<unknown>
    | AsyncAccessor<unknown>
    ? T[K]
    : InferValue<T[K]>;
};

/**
 * Wraps child fields with AsyncAccessor when the parent is asynchronous (Promise).
 * Used for child accessors in t.secret({ schema }).
 */
type AsyncNestedFields<T extends object> = {
  [K in keyof T as K extends `$${string}` ? never : K]: AsyncAccessor<T[K]>;
};

/**
 * Determines the sync/async accessor based on whether the return type R of `_resolve` is a Promise.
 * TypeDef with `_objectType: true` (t.object()) exposes both sync and async accessors along with child fields.
 * When `_objectSchema` is present, $value()/$resolve() returns the raw value type.
 * TypeDef with `_templateType: true` (t.template()) exposes both SyncAccessor & AsyncAccessor.
 *   - $value() can be used when all referenced fields are synchronous.
 *   - If any referenced field is async, $value() throws SchemaDefinitionError and $resolve() must be used.
 */
export type InferValue<TD> = TD extends TypeDef<infer R> & { readonly _templateType: true }
  ? R extends Promise<infer U>
    ? SyncAccessor<U> & AsyncAccessor<U>
    : SyncAccessor<R> & AsyncAccessor<R>
  : TD extends TypeDef<infer R> & {
        readonly _objectType: true;
        readonly _objectSchema: infer S extends SettingsSchema;
      }
    ? R extends object
      ? SyncAccessor<InferRawSettings<S>> & AsyncAccessor<InferRawSettings<S>> & NestedFields<R>
      : SyncAccessor<InferRawSettings<S>> & AsyncAccessor<InferRawSettings<S>>
    : TD extends TypeDef<infer R> & { readonly _objectType: true }
      ? R extends object
        ? SyncAccessor<R> & AsyncAccessor<R> & NestedFields<R>
        : SyncAccessor<R> & AsyncAccessor<R>
      : TD extends TypeDef<infer R> & { readonly _schema: SettingsSchema }
        ? R extends Promise<infer U>
          ? U extends object
            ? AsyncAccessor<U> & AsyncNestedFields<U>
            : AsyncAccessor<U>
          : never
        : TD extends TypeDef<infer R>
          ? R extends Promise<infer U>
            ? U extends object
              ? AsyncAccessor<U> & NestedFields<U>
              : AsyncAccessor<U>
            : R extends object
              ? R extends readonly unknown[]
                ? SyncAccessor<R>
                : R extends Date
                  ? SyncAccessor<R>
                  : SyncAccessor<R> & NestedFields<R>
              : SyncAccessor<R>
          : TD extends object
            ? SyncAccessor<TD>
            : SyncAccessor<TD>;

export type InferSettings<T extends SettingsSchema> = {
  [K in keyof T]: InferValue<T[K]>;
};

/**
 * Extracts the raw value type from each field in the schema.
 * Used as the return type of $resolve() for t.secret({ schema }).
 */
export type InferRawSettings<T extends SettingsSchema> = {
  [K in keyof T]: T[K] extends TypeDef<Promise<infer U>>
    ? U
    : T[K] extends TypeDef<infer U>
      ? U
      : T[K];
};

export interface BaseOptions<T> {
  key?: string;
  prefix?: string;
  default?: T;
  optional?: boolean;
}

/**
 * Resolves the environment variable key and field name from field options, schema key, and default prefix.
 * - When `key` is specified: uses `key` as-is for the env var key (ignores `prefix`)
 * - When only `prefix` is specified: `prefix` + group key + schema key
 * - When neither is specified: default prefix + group key + schema key
 *
 * `prefix` overrides only the global prefix; the group key (`GROUP_` portion) is always appended.
 *
 * @param field - Field definition with `key` and `prefix` properties
 * @param schemaKey - Key name in the schema (fallback when `key` is not specified)
 * @param defaultPrefix - Default prefix applied to env var keys (global prefix)
 * @param groupKey - Key portion for the containing group (e.g. `"GROUP_"`). Empty string for top-level.
 * @returns `envKey` (env var key name) and `fieldName` (field name for error messages)
 */
export function resolveKeys(
  field: { key?: string; prefix?: string },
  schemaKey: string,
  defaultPrefix: string,
  groupKey = "",
): { envKey: string; fieldName: string } {
  if (field.key !== undefined) return { envKey: field.key, fieldName: field.key };
  const globalPrefix = field.prefix ?? defaultPrefix;
  return { envKey: `${globalPrefix}${groupKey}${schemaKey}`, fieldName: schemaKey };
}

/**
 * Processes the raw environment variable value and applies the transform function `onValue` to return a typed value.
 * When raw is undefined, uses the default value; returns undefined if optional.
 * Throws `MissingEnvError` if neither applies.
 *
 * @param raw - Raw string value of the environment variable (undefined if not set)
 * @param opts - Default value and optional flag
 * @param onValue - Transform function applied when raw is present
 */
export function resolveRaw<T>(
  raw: string | undefined,
  opts: { default?: T; optional?: boolean } = {},
  onValue: (raw: string) => T,
): T | undefined {
  if (raw !== undefined) return onValue(raw);
  if (opts.default !== undefined) return opts.default;
  if (opts.optional) return undefined;
  throw new MissingEnvError();
}

/**
 * Constructs a `TypeDef<T>` object. Attaches the `TYPE_BRAND` symbol to enable type identification.
 *
 * @param def - Object with a `_resolve` function and optional TypeDef fields
 */
export function createTypeDef<T>(
  def: Omit<TypeDef<T>, typeof TYPE_BRAND> & { _resolve: (ctx: ResolveCtx) => T | Promise<T> },
): TypeDef<T> {
  return { [TYPE_BRAND]: true as const, ...def } as unknown as TypeDef<T>;
}
