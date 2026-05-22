import { parse as dateParse, isValid, parseISO } from "date-fns";
import { InvalidValueError, MissingEnvError, SchemaDefinitionError } from "./errors.js";
import type { EnvSource } from "./loader.js";

// ── Brand tag ─────────────────────────────────────────────────────────────────

/** Symbol key used to identify field definitions at runtime. */
const FIELD_BRAND = Symbol("FieldDef");

/** Base type for all field definitions. Distinguished from plain objects by the `FIELD_BRAND` symbol. */
export type FieldDef<T> = {
  readonly [FIELD_BRAND]: true;
  readonly _resolve: (schemaKey: string, prefix: string, env: EnvSource) => T;
};

export function isField(v: unknown): v is FieldDef<unknown> {
  return typeof v === "object" && v !== null && FIELD_BRAND in v;
}

// ── EnvKey ────────────────────────────────────────────────────────────────────

export type EnvKey = string | { name: string; prefix?: string };

// ── Shared options ────────────────────────────────────────────────────────────

interface BaseOptions<T> {
  key?: EnvKey;
  default?: T;
  optional?: boolean;
}

// ── Field factory helper ──────────────────────────────────────────────────────

/** Resolves the environment variable key and logical field name from opts and schemaKey. */
function resolveKeys(
  opts: { key?: EnvKey },
  schemaKey: string,
  prefix: string,
): { envKey: string; fieldName: string } {
  const key = opts.key ?? schemaKey;
  if (typeof key === "string") return { envKey: `${prefix}${key}`, fieldName: key };
  return { envKey: `${key.prefix ?? prefix}${key.name}`, fieldName: key.name || schemaKey };
}

/**
 * Shared helper that reads a raw string from env and transforms it via the resolve callback.
 * When raw is undefined, it falls through: default → optional → MissingEnvError.
 */
function makeField<T>(
  resolve: (raw: string, fieldName: string) => T,
  opts: BaseOptions<T>,
): FieldDef<T> {
  return {
    [FIELD_BRAND]: true,
    _resolve(schemaKey: string, prefix: string, env: EnvSource): T {
      const { envKey, fieldName } = resolveKeys(opts, schemaKey, prefix);
      const raw = env[envKey];

      if (raw !== undefined) return resolve(raw, fieldName);
      if (opts.default !== undefined) return opts.default;
      if (opts.optional) return undefined as T;
      throw new MissingEnvError(fieldName);
    },
  } as FieldDef<T>;
}

// ── f.StringType ──────────────────────────────────────────────────────────────

/** String field definition. Reads an env var and returns it as a string. Supports regex validation and option enums. */

type StringTypeResult<O extends readonly string[]> = string[] extends O
  ? string
  : O extends readonly (infer S extends string)[]
    ? S
    : string;

interface StringTypeOptions<O extends readonly string[]> extends BaseOptions<StringTypeResult<O>> {
  regex?: RegExp;
  options?: O;
}

export function StringType<const O extends readonly string[] = string[]>(
  opts: StringTypeOptions<O> & { optional: true },
): FieldDef<StringTypeResult<O> | undefined>;
export function StringType<const O extends readonly string[] = string[]>(
  opts?: StringTypeOptions<O>,
): FieldDef<StringTypeResult<O>>;
export function StringType<const O extends readonly string[]>(
  opts?: StringTypeOptions<O>,
): FieldDef<unknown> {
  return makeField((raw, fieldName) => {
    if (opts?.regex && !opts.regex.test(raw)) {
      throw new InvalidValueError(fieldName, `"${raw}" does not match pattern ${opts.regex}`);
    }
    if (opts?.options && !opts.options.includes(raw as never)) {
      throw new InvalidValueError(
        fieldName,
        `"${raw}" is not one of the allowed values: ${opts.options.map((o) => JSON.stringify(o)).join(", ")}`,
      );
    }
    return raw;
  }, opts ?? {});
}

// ── f.NumberType ──────────────────────────────────────────────────────────────

/** Number field definition. Reads an env var, trims it, and parses it as a number. Supports option enums. */

type NumberTypeResult<O extends readonly number[]> = number[] extends O
  ? number
  : O extends readonly (infer N extends number)[]
    ? N
    : number;

interface NumberTypeOptions<O extends readonly number[]> extends BaseOptions<NumberTypeResult<O>> {
  options?: O;
}

export function NumberType<const O extends readonly number[] = number[]>(
  opts: NumberTypeOptions<O> & { optional: true },
): FieldDef<NumberTypeResult<O> | undefined>;
export function NumberType<const O extends readonly number[] = number[]>(
  opts?: NumberTypeOptions<O>,
): FieldDef<NumberTypeResult<O>>;
export function NumberType<const O extends readonly number[]>(
  opts?: NumberTypeOptions<O>,
): FieldDef<unknown> {
  return makeField((raw, fieldName) => {
    const trimmed = raw.trim();
    const n = trimmed === "" ? NaN : globalThis.Number(trimmed);
    if (Number.isNaN(n)) throw new InvalidValueError(fieldName, `"${raw}" is not a valid number`);
    if (opts?.options && !opts.options.includes(n as never)) {
      throw new InvalidValueError(
        fieldName,
        `${n} is not one of the allowed values: ${opts.options.join(", ")}`,
      );
    }
    return n;
  }, opts ?? {});
}

// ── f.BooleanType ─────────────────────────────────────────────────────────────

/** Boolean field definition. Reads an env var and maps it to true/false using configurable value sets. Case-insensitive. */

const DEFAULT_TRUE_VALUES = ["true", "1", "yes"];
const DEFAULT_FALSE_VALUES = ["false", "0", "no"];

interface BooleanTypeOptions extends BaseOptions<boolean> {
  trueValues?: string[];
  /**
   * Set to false to throw an error when a value matches neither trueValues nor falseValues.
   * Default true (unrecognized values are treated as false for backward compatibility).
   */
  allowUnrecognized?: boolean;
  falseValues?: string[];
}

export function BooleanType(
  opts: BooleanTypeOptions & { optional: true },
): FieldDef<boolean | undefined>;
export function BooleanType(opts?: BooleanTypeOptions): FieldDef<boolean>;
export function BooleanType(opts?: BooleanTypeOptions): FieldDef<unknown> {
  return makeField((raw, fieldName) => {
    const trueValues = opts?.trueValues ?? DEFAULT_TRUE_VALUES;
    const falseValues = opts?.falseValues ?? DEFAULT_FALSE_VALUES;
    const allowUnrecognized = opts?.allowUnrecognized ?? true;
    const normalized = raw.toLowerCase();

    if (trueValues.includes(normalized)) return true;
    if (falseValues.includes(normalized) || allowUnrecognized) return false;
    throw new InvalidValueError(
      fieldName,
      `"${raw}" is not a recognized boolean value (true: ${trueValues.join(", ")} / false: ${falseValues.join(", ")})`,
    );
  }, opts ?? {});
}

// ── f.DateType ────────────────────────────────────────────────────────────────

/** Date field definition. Reads an env var and parses it as a Date (ISO 8601 or custom format via date-fns). */

interface DateTypeOptions extends BaseOptions<Date> {
  format?: string;
}

export function DateType(opts: DateTypeOptions & { optional: true }): FieldDef<Date | undefined>;
export function DateType(opts?: DateTypeOptions): FieldDef<Date>;
export function DateType(opts?: DateTypeOptions): FieldDef<unknown> {
  return makeField((raw, fieldName) => {
    if (opts?.format) {
      const d = dateParse(raw, opts.format, new globalThis.Date());
      if (!isValid(d))
        throw new InvalidValueError(fieldName, `"${raw}" does not match format "${opts.format}"`);
      return d;
    }
    const d = parseISO(raw);
    if (!isValid(d))
      throw new InvalidValueError(fieldName, `"${raw}" is not a valid ISO 8601 date`);
    return d;
  }, opts ?? {});
}

// ── f.ArrayType ───────────────────────────────────────────────────────────────

/** Array field definition. Reads a delimited env var string and splits it into an array, optionally transforming each element via a sub-field. */

type InferFieldType<F> = F extends FieldDef<infer T> ? T : never;

interface ArrayTypeOptions<F extends FieldDef<unknown>> extends BaseOptions<InferFieldType<F>[]> {
  type?: F;
  delimiter?: string;
}

export function ArrayType<F extends FieldDef<unknown> = FieldDef<string>>(
  opts: ArrayTypeOptions<F> & { optional: true },
): FieldDef<InferFieldType<F>[] | undefined>;
export function ArrayType<F extends FieldDef<unknown> = FieldDef<string>>(
  opts?: ArrayTypeOptions<F>,
): FieldDef<InferFieldType<F>[]>;
export function ArrayType<F extends FieldDef<unknown>>(
  opts?: ArrayTypeOptions<F>,
): FieldDef<unknown> {
  const itemField = (opts?.type ?? StringType()) as FieldDef<unknown>;
  const delimiter = opts?.delimiter ?? ",";

  return makeField((raw, fieldName) => {
    if (raw === "") return [];
    return raw.split(delimiter).map((item, i) => {
      try {
        return itemField._resolve("", "", { "": item.trim() });
      } catch (e) {
        if (e instanceof InvalidValueError) {
          throw new InvalidValueError(
            fieldName,
            `at index ${i}: ${e.message.replace(/^Invalid value for [^:]+: /, "")}`,
          );
        }
        if (e instanceof MissingEnvError) {
          throw new InvalidValueError(fieldName, `at index ${i}: missing value`);
        }
        throw e;
      }
    });
  }, opts ?? {});
}

// ── f.Json ────────────────────────────────────────────────────────────────────

/** JSON field definition. Reads an env var and parses it via JSON.parse. */

export function Json<TSchema = unknown>(
  opts: BaseOptions<TSchema> & { optional: true },
): FieldDef<TSchema | undefined>;
export function Json<TSchema = unknown>(opts?: BaseOptions<TSchema>): FieldDef<TSchema>;
export function Json<TSchema>(opts?: BaseOptions<TSchema>): FieldDef<unknown> {
  return makeField((raw, fieldName) => {
    try {
      return JSON.parse(raw) as TSchema;
    } catch {
      throw new InvalidValueError(fieldName, `"${raw}" is not valid JSON`);
    }
  }, opts ?? {});
}

// ── f.Template ────────────────────────────────────────────────────────────────

/**
 * Template field that references other resolved fields using `{KEY}` / `{GROUP.KEY}` syntax.
 * Resolved in Pass 2 (after all non-template fields), so it can reference any field in the same schema.
 */
export function Template(template: string): FieldDef<string> & { readonly _template: string } {
  return {
    [FIELD_BRAND]: true,
    _template: template,
    _resolve(): string {
      throw new SchemaDefinitionError("Template fields must be resolved in Pass 2");
    },
  } as FieldDef<string> & { readonly _template: string };
}

export function isTemplateField(v: unknown): v is FieldDef<string> & { _template: string } {
  return (
    isField(v) && "_template" in v && typeof (v as { _template: unknown })._template === "string"
  );
}

// ── f.ZodSchema ───────────────────────────────────────────────────────────────

/** Zod schema adapter. Uses any Zod schema directly for parsing and validation. */

type ZodLike<T> = { parse(value: unknown): T };

interface ZodSchemaOptions<TSchema extends ZodLike<unknown>>
  extends Omit<BaseOptions<ReturnType<TSchema["parse"]>>, "default" | "optional"> {
  schema: TSchema;
  optional?: boolean;
}

export function ZodSchema<TSchema extends ZodLike<unknown>>(
  opts: ZodSchemaOptions<TSchema> & { optional: true },
): FieldDef<ReturnType<TSchema["parse"]> | undefined>;
export function ZodSchema<TSchema extends ZodLike<unknown>>(
  opts: ZodSchemaOptions<TSchema>,
): FieldDef<ReturnType<TSchema["parse"]>>;
export function ZodSchema<TSchema extends ZodLike<unknown>>(
  opts: ZodSchemaOptions<TSchema>,
): FieldDef<unknown> {
  return {
    [FIELD_BRAND]: true,
    _resolve(schemaKey: string, prefix: string, env: EnvSource): unknown {
      const { envKey, fieldName } = resolveKeys(opts, schemaKey, prefix);
      const raw = env[envKey];
      if (raw === undefined && opts.optional) return undefined;
      try {
        return opts.schema.parse(raw);
      } catch (error) {
        throw new InvalidValueError(
          fieldName,
          error instanceof Error ? error.message : globalThis.String(error),
        );
      }
    },
  } as FieldDef<unknown>;
}

// ── f.ValibotSchema ───────────────────────────────────────────────────────────

/** Valibot schema adapter. Uses any Standard Schema v1 compliant schema (Valibot, ArkType, etc.) for parsing and validation. */

type StandardSchemaResult =
  | {
      readonly typed: true;
      readonly value: unknown;
      readonly issues?: ReadonlyArray<{ readonly message: string }>;
    }
  | {
      readonly typed: false;
      readonly value?: unknown;
      readonly issues: ReadonlyArray<{ readonly message: string }>;
    };

type StandardSchemaV1<TOutput> = {
  "~standard": {
    readonly version: 1;
    validate(value: unknown): StandardSchemaResult | Promise<StandardSchemaResult>;
    readonly types?: { readonly input: unknown; readonly output: TOutput };
  };
};

type InferStandardOutput<S> = S extends { "~standard": { types?: { output: infer O } | undefined } }
  ? O
  : S extends StandardSchemaV1<infer O>
    ? O
    : unknown;

interface ValibotSchemaOptions<TSchema>
  extends Omit<BaseOptions<InferStandardOutput<TSchema>>, "default" | "optional"> {
  schema: TSchema;
  optional?: boolean;
}

export function ValibotSchema<TSchema>(
  opts: ValibotSchemaOptions<TSchema> & { optional: true },
): FieldDef<InferStandardOutput<TSchema> | undefined>;
export function ValibotSchema<TSchema>(
  opts: ValibotSchemaOptions<TSchema>,
): FieldDef<InferStandardOutput<TSchema>>;
export function ValibotSchema<TSchema>(opts: ValibotSchemaOptions<TSchema>): FieldDef<unknown> {
  return {
    [FIELD_BRAND]: true,
    _resolve(schemaKey: string, prefix: string, env: EnvSource): unknown {
      const { envKey, fieldName } = resolveKeys(opts, schemaKey, prefix);
      const raw = env[envKey];
      if (raw === undefined && opts.optional) return undefined;

      const schemaObj = opts.schema as Record<string, unknown>;
      if (!("~standard" in schemaObj) || typeof schemaObj["~standard"] !== "object") {
        throw new SchemaDefinitionError(
          `ValibotSchema: schema for "${fieldName}" does not implement Standard Schema interface`,
        );
      }
      const schema = opts.schema as unknown as StandardSchemaV1<unknown>;
      const result = schema["~standard"].validate(raw);
      if (result instanceof Promise) {
        throw new SchemaDefinitionError(
          `ValibotSchema: async schemas are not supported (field: "${fieldName}")`,
        );
      }
      if (result.issues && result.issues.length > 0) {
        throw new InvalidValueError(fieldName, result.issues.map((i) => i.message).join(", "));
      }
      return result.value;
    },
  } as FieldDef<unknown>;
}

export default {
  String: StringType,
  Number: NumberType,
  Boolean: BooleanType,
  Date: DateType,
  Array: ArrayType,
  Json,
  Template,
  ZodSchema,
  ValibotSchema,
};
