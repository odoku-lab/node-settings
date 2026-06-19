import { InvalidValueError, SchemaDefinitionError } from "../errors.js";
import type {
  BaseOptions,
  InferSettings,
  ResolveCtx,
  SettingsSchema,
  TypeDef,
  ValuesProxy,
} from "./core.js";
import { createTypeDef, resolveRaw } from "./core.js";

// ── func ────────────────────────────────────────────────────────────────────

export interface FuncOptions {
  ttl?: number;
  key?: string;
  prefix?: string;
}

// Reference to the async function constructor (allows instance comparison after minification)
// c8 ignore next: immediately-invoked arrow function excluded from coverage measurement
const AsyncFunction = /* c8 ignore next */ (async () => {}).constructor;

/**
 * Defines a context function as a deferred field.
 * A sync function becomes a sync field accessible via `$value()`.
 * An async function becomes an async field accessible via `$resolve()` / `$refresh()`.
 *
 * By default, each field in `ctx.values` has type `ValuesAccessor<unknown>`.
 * For full type safety, pass the schema as `InferSettings<typeof schema>`:
 * ```ts
 * const schema = { PORT: t.number({ default: 3000 }), HOST: t.string() };
 * t.func<string, InferSettings<typeof schema>>(({ values }) => `${values.HOST.$value()}:${values.PORT.$value()}`)
 * ```
 *
 * @param fn - Function called on resolution (sync or async).
 * @param opts - Options. `ttl` sets the cache expiration in ms; `key` sets the env var key.
 */
export function func<T, V extends Record<string, unknown> = ValuesProxy>(
  fn: (ctx: ResolveCtx<V>) => Promise<T>,
  opts?: FuncOptions,
): TypeDef<Promise<T>>;
export function func<T, V extends Record<string, unknown> = ValuesProxy>(
  fn: (ctx: ResolveCtx<V>) => T,
  opts?: FuncOptions,
): TypeDef<T>;
export function func<T, V extends Record<string, unknown> = ValuesProxy>(
  fn: (ctx: ResolveCtx<V>) => T | Promise<T>,
  opts?: FuncOptions,
): TypeDef<T> | TypeDef<Promise<T>> {
  const isAsync = fn instanceof AsyncFunction;
  return createTypeDef<T | Promise<T>>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve: fn as unknown as (ctx: ResolveCtx) => T | Promise<T>,
    ...(isAsync && { _async: true as const }),
    ...(opts?.ttl !== undefined && { _cache: { ttl: opts.ttl } }),
  }) as TypeDef<T> | TypeDef<Promise<T>>;
}

// ── constant ────────────────────────────────────────────────────────────────

/**
 * Defines a TypeDef that always returns a fixed value.
 * Use when you want to define a constant directly in the schema rather than from an env var.
 *
 * @param value - The constant value to always return
 */
export function constant<const T>(value: T): TypeDef<T> {
  return createTypeDef<T>({ _resolve: () => value });
}

// ── stringType ──────────────────────────────────────────────────────────────

type StringTypeResult<O extends readonly string[]> = string[] extends O
  ? string
  : O extends readonly (infer S extends string)[]
    ? S
    : string;

interface StringTypeOptions<O extends readonly string[]> extends BaseOptions<StringTypeResult<O>> {
  regex?: RegExp;
  options?: O;
}

/**
 * Defines a string field type. Supports regex validation and restricting to a set of allowed values.
 *
 * @param opts.regex - Regular expression the value must match
 * @param opts.options - Allowed values (inferred as literal types for const arrays)
 * @param opts.optional - When true, returns undefined if not set
 * @param opts.default - Default value when the env var is not set
 */
export function stringType<const O extends readonly string[] = string[]>(
  opts: StringTypeOptions<O> & { optional: true },
): TypeDef<StringTypeResult<O> | undefined>;
export function stringType<const O extends readonly string[] = string[]>(
  opts?: StringTypeOptions<O>,
): TypeDef<StringTypeResult<O>>;
export function stringType<const O extends readonly string[]>(
  opts?: StringTypeOptions<O>,
): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => {
        if (opts?.regex && !opts.regex.test(v)) {
          throw InvalidValueError.forMessage(`"${v}" does not match pattern ${opts.regex}`);
        }
        if (opts?.options && !opts.options.includes(v as never)) {
          throw InvalidValueError.forMessage(
            `"${v}" is not one of the allowed values: ${opts.options.map((o) => JSON.stringify(o)).join(", ")}`,
          );
        }
        return v;
      });
    },
  });
}

// ── numberType ───────────────────────────────────────────────────────────────

type NumberTypeResult<O extends readonly number[]> = number[] extends O
  ? number
  : O extends readonly (infer N extends number)[]
    ? N
    : number;

interface NumberTypeOptions<O extends readonly number[]> extends BaseOptions<NumberTypeResult<O>> {
  options?: O;
  min?: number;
  max?: number;
  integer?: boolean;
}

/**
 * Defines a number field type. Supports parsing from string and restricting to allowed values or a range.
 *
 * @param opts.options - Allowed values (inferred as literal types for const arrays)
 * @param opts.min - Minimum value (inclusive)
 * @param opts.max - Maximum value (inclusive)
 * @param opts.integer - When true, only integers are accepted
 * @param opts.optional - When true, returns undefined if not set
 * @param opts.default - Default value when the env var is not set
 */
export function numberType<const O extends readonly number[] = number[]>(
  opts: NumberTypeOptions<O> & { optional: true },
): TypeDef<NumberTypeResult<O> | undefined>;
export function numberType<const O extends readonly number[] = number[]>(
  opts?: NumberTypeOptions<O>,
): TypeDef<NumberTypeResult<O>>;
export function numberType<const O extends readonly number[]>(
  opts?: NumberTypeOptions<O>,
): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => {
        const trimmed = v.trim();
        const n = trimmed === "" ? NaN : globalThis.Number(trimmed);
        if (Number.isNaN(n)) throw InvalidValueError.forMessage(`"${v}" is not a valid number`);
        if (opts?.integer && !Number.isInteger(n)) {
          throw InvalidValueError.forMessage(`${n} is not an integer`);
        }
        if (opts?.min !== undefined && n < opts.min) {
          throw InvalidValueError.forMessage(`${n} is less than minimum value ${opts.min}`);
        }
        if (opts?.max !== undefined && n > opts.max) {
          throw InvalidValueError.forMessage(`${n} is greater than maximum value ${opts.max}`);
        }
        if (opts?.options && !opts.options.includes(n as never)) {
          throw InvalidValueError.forMessage(
            `${n} is not one of the allowed values: ${opts.options.join(", ")}`,
          );
        }
        return n;
      });
    },
  });
}

// ── booleanType ─────────────────────────────────────────────────────────────

const DEFAULT_TRUE_VALUES = ["true", "1", "yes"];
const DEFAULT_FALSE_VALUES = ["false", "0", "no"];

interface BooleanTypeOptions extends BaseOptions<boolean> {
  trueValues?: string[];
  allowUnrecognized?: boolean;
  falseValues?: string[];
}

/**
 * Defines a boolean field type. The strings recognized as true/false can be customized.
 *
 * @param opts.trueValues - Strings treated as true (default: `["true", "1", "yes"]`)
 * @param opts.falseValues - Strings treated as false (default: `["false", "0", "no"]`)
 * @param opts.allowUnrecognized - Whether to treat unrecognized values as false (default: true)
 * @param opts.optional - When true, returns undefined if not set
 */
export function booleanType(
  opts: BooleanTypeOptions & { optional: true },
): TypeDef<boolean | undefined>;
export function booleanType(opts?: BooleanTypeOptions): TypeDef<boolean>;
export function booleanType(opts?: BooleanTypeOptions): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => {
        const trueValues = opts?.trueValues ?? DEFAULT_TRUE_VALUES;
        const falseValues = opts?.falseValues ?? DEFAULT_FALSE_VALUES;
        const allowUnrecognized = opts?.allowUnrecognized ?? true;
        const normalized = v.toLowerCase();
        if (trueValues.includes(normalized)) return true;
        if (falseValues.includes(normalized)) return false;
        if (allowUnrecognized) return false;
        throw InvalidValueError.forMessage(
          `"${v}" is not a recognized boolean value (true: ${trueValues.join(", ")} / false: ${falseValues.join(", ")})`,
        );
      });
    },
  });
}

// ── dateType ────────────────────────────────────────────────────────────────

interface DateTypeOptions extends BaseOptions<Date> {
  format?: string;
}

const DATE_TOKEN = /^(y{1,4}|M{1,2}|d{1,2}|H{1,2}|m{1,2}|s{1,2})/;

type DateCapture = { token: string; len: number };

/** Builds a matching regex and token list from a format string. */
function buildDateRegex(format: string): { regex: RegExp; captures: DateCapture[] } {
  let remaining = format;
  let regexStr = "^";
  const captures: DateCapture[] = [];

  while (remaining.length > 0) {
    const m = remaining.match(DATE_TOKEN);
    if (m) {
      const token = m[1];
      captures.push({ token, len: token.length });
      if (token.startsWith("y")) {
        regexStr += token.length >= 4 ? "(\\d{4})" : token.length === 2 ? "(\\d{2})" : "(\\d{1,2})";
      } else {
        regexStr += token.length >= 2 ? "(\\d{2})" : "(\\d{1,2})";
      }
      remaining = remaining.slice(token.length);
    } else {
      const ch = remaining[0];
      regexStr += /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
      remaining = remaining.slice(1);
    }
  }
  return { regex: new RegExp(`${regexStr}$`), captures };
}

/** Constructs a Date from a match result and a token list. */
function buildDateFromMatch(match: RegExpMatchArray, captures: DateCapture[]): Date {
  let year = 2000;
  let month = 0;
  let day = 1;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  for (let i = 0; i < captures.length; i++) {
    const val = Number(match[i + 1]);
    const { token, len } = captures[i];
    if (token.startsWith("y")) year = len !== 2 ? val : 2000 + val;
    else if (token.startsWith("M")) month = val - 1;
    else if (token.startsWith("d")) day = val;
    else if (token.startsWith("H")) hours = val;
    else if (token.startsWith("m")) minutes = val;
    else seconds = val;
  }

  const d = new Date(year, month, day, hours, minutes, seconds);
  /* c8 ignore next */
  if (Number.isNaN(d.getTime()))
    throw InvalidValueError.forMessage(`"${match.input}" is not a valid date`);
  return d;
}

/**
 * Parses a date string and returns a `Date` object.
 * Parses with a custom format when `format` is specified; otherwise interprets as ISO 8601.
 * Supported tokens: `yyyy`/`yy` (year), `MM`/`M` (month), `dd`/`d` (day), `HH`/`H` (hour), `mm`/`m` (minute), `ss`/`s` (second)
 */
function parseDateValue(v: string, format?: string): Date {
  if (!format) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime()))
      throw InvalidValueError.forMessage(`"${v}" is not a valid ISO 8601 date`);
    return d;
  }
  const { regex, captures } = buildDateRegex(format);
  const match = v.match(regex);
  if (!match) throw InvalidValueError.forMessage(`"${v}" does not match format "${format}"`);
  return buildDateFromMatch(match, captures);
}

/**
 * Defines a date field type. Parses ISO 8601 or custom-format date strings into `Date` objects.
 *
 * @param opts.format - Custom date format (e.g. `"yyyy-MM-dd"`). Interpreted as ISO 8601 when not specified.
 * @param opts.optional - When true, returns undefined if not set
 */
export function dateType(opts: DateTypeOptions & { optional: true }): TypeDef<Date | undefined>;
export function dateType(opts?: DateTypeOptions): TypeDef<Date>;
export function dateType(opts?: DateTypeOptions): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => parseDateValue(v, opts?.format));
    },
  });
}

// ── arrayType ───────────────────────────────────────────────────────────────

type InferItemType<F> = F extends TypeDef<infer T> ? T : never;

interface ArrayTypeOptions<F extends TypeDef<unknown>> extends BaseOptions<InferItemType<F>[]> {
  type?: F;
  delimiter?: string;
}

/**
 * Defines an array field type. Parses a string split by a delimiter and interprets each element as the specified type.
 *
 * @param opts.type - TypeDef for each element (default: `t.string()`)
 * @param opts.delimiter - Delimiter between elements (default: `","`)
 * @param opts.optional - When true, returns undefined if not set
 */
export function arrayType<F extends TypeDef<unknown> = TypeDef<string>>(
  opts: ArrayTypeOptions<F> & { optional: true },
): TypeDef<InferItemType<F>[] | undefined>;
export function arrayType<F extends TypeDef<unknown> = TypeDef<string>>(
  opts?: ArrayTypeOptions<F>,
): TypeDef<InferItemType<F>[]>;
export function arrayType<F extends TypeDef<unknown>>(
  opts?: ArrayTypeOptions<F>,
): TypeDef<unknown> {
  const itemField = (opts?.type ?? stringType()) as unknown as TypeDef<unknown>;
  const delimiter = opts?.delimiter ?? ",";

  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve(ctx: ResolveCtx): unknown {
      return resolveRaw(ctx.raw, opts, (v) => {
        if (v === "") return [];
        return v.split(delimiter).map((item, i) => {
          try {
            return itemField._resolve({
              ...ctx,
              raw: item.trim(),
            });
          } catch (e) {
            if (!(e instanceof InvalidValueError)) throw e;
            throw InvalidValueError.forMessage(`at index ${i}: ${e.message}`);
          }
        });
      });
    },
  });
}

// ── json ────────────────────────────────────────────────────────────────────

/**
 * Defines a JSON field type. Parses the env var string value with `JSON.parse` and returns it.
 *
 * @param opts.optional - When true, returns undefined if not set
 */
export function json<TSchema = unknown>(
  opts: BaseOptions<TSchema> & { optional: true },
): TypeDef<TSchema | undefined>;
export function json<TSchema = unknown>(opts?: BaseOptions<TSchema>): TypeDef<TSchema>;
export function json<TSchema>(opts?: BaseOptions<TSchema>): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => {
        try {
          return JSON.parse(v) as TSchema;
        } catch {
          throw InvalidValueError.forMessage(`"${v}" is not valid JSON`);
        }
      });
    },
  });
}

// ── urlType ─────────────────────────────────────────────────────────────────

type URLTypeOptions = BaseOptions<URL>;

/**
 * Defines a URL field type. Parses the env var string value with `new URL()` and returns it.
 *
 * @param opts.optional - When true, returns undefined if not set
 */
export function urlType(opts: URLTypeOptions & { optional: true }): TypeDef<URL | undefined>;
export function urlType(opts?: URLTypeOptions): TypeDef<URL>;
export function urlType(opts?: URLTypeOptions): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => {
        try {
          return new URL(v);
        } catch {
          throw InvalidValueError.forMessage(`"${v}" is not a valid URL`);
        }
      });
    },
  });
}

// ── durationType ────────────────────────────────────────────────────────────

type DurationTypeOptions = BaseOptions<number>;

const DURATION_RE = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?\s*$/i;
const DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Defines a duration field type. Converts strings with units `ms`, `s`, `m`, `h`, `d`, `w` to a number in milliseconds.
 * When the unit is omitted, it is treated as ms.
 *
 * @param opts.optional - When true, returns undefined if not set
 */
export function durationType(
  opts: DurationTypeOptions & { optional: true },
): TypeDef<number | undefined>;
export function durationType(opts?: DurationTypeOptions): TypeDef<number>;
export function durationType(opts?: DurationTypeOptions): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts?.key,
    prefix: opts?.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      return resolveRaw(raw, opts, (v) => {
        const trimmed = v.trim();
        const match = trimmed.match(DURATION_RE);
        if (!match) throw InvalidValueError.forMessage(`"${v}" is not a valid duration`);
        const value = Number(match[1]);
        const suffix = (match[2] ?? "").toLowerCase() as keyof typeof DURATION_MULTIPLIERS;
        const multiplier = DURATION_MULTIPLIERS[suffix] ?? 1;
        return value * multiplier;
      });
    },
  });
}

// ── objectType ───────────────────────────────────────────────────────────────

export interface ObjectTypeOptions {
  prefix?: string;
}

/**
 * Defines a nested object group.
 * Each field in the group is resolved from environment variables in the `PREFIX_KEY` form.
 *
 * @param schema - Field definitions within the group
 * @param opts.prefix - Overrides the group prefix (default is schema key + `_`)
 */
export function objectType<S extends SettingsSchema>(
  schema: S,
  opts?: ObjectTypeOptions,
): TypeDef<InferSettings<S>> & { readonly _objectType: true; readonly _objectSchema: S } {
  return createTypeDef<InferSettings<S>>({
    // This _resolve is never called. resolver.ts expands child fields by inspecting _objectType and _schema.
    _resolve(): InferSettings<S> {
      return {} as InferSettings<S>;
    },
    _objectType: true as const,
    _objectSchema: schema as SettingsSchema,
    _schema: schema,
    _objectPrefix: opts?.prefix,
  }) as TypeDef<InferSettings<S>> & { readonly _objectType: true; readonly _objectSchema: S };
}

// ── template ────────────────────────────────────────────────────────────────

/**
 * Defines a template string field.
 * Embeds values of other fields using `{FIELD_NAME}` or `{GROUP.FIELD}` placeholders.
 * Treated as a deferred field; evaluated after dependent fields are resolved.
 *
 * Use `$resolve()` when any referenced field is asynchronous.
 * `$value()` can be used when all referenced fields are synchronous.
 * Calling `$value()` while referencing an async field throws `SchemaDefinitionError`.
 *
 * @param template - Template string containing `{FIELD}` placeholders
 */
export function template(
  tmpl: string,
): TypeDef<Promise<string>> & { readonly _templateType: true } {
  return createTypeDef<Promise<string>>({
    _async: true as const,
    _templateType: true as const,
    _cache: { ttl: 0 },
    async _resolve({ values }: ResolveCtx): Promise<string> {
      const placeholders = [...tmpl.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const resolvedMap = new Map<string, string>();

      for (const path of placeholders) {
        if (resolvedMap.has(path)) continue;
        let value: unknown = values;
        for (const part of path.split(".")) {
          if (value === null || typeof value !== "object") {
            throw new SchemaDefinitionError(`Template reference not found: ${path}`);
          }
          value = (value as Record<string, unknown>)[part];
          if (value === undefined) {
            throw new SchemaDefinitionError(`Template reference not found: ${path}`);
          }
        }
        const accessor = value as Record<string, unknown>;
        if (typeof accessor.$resolve === "function") {
          resolvedMap.set(path, String(await (accessor.$resolve as () => Promise<unknown>)()));
        } else {
          resolvedMap.set(path, String(value));
        }
      }

      return tmpl.replace(
        /\{([^}]+)\}/g,
        (_match, path: string) => resolvedMap.get(path) as string,
      );
    },
  }) as unknown as TypeDef<Promise<string>> & { readonly _templateType: true };
}
