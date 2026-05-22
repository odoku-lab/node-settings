import { SettingsError, SettingsValidationError } from "./errors.js";
import type { FieldDef } from "./fields.js";
import _fields, { isField, isTemplateField } from "./fields.js";
import type { EnvSource } from "./loader.js";
import { buildEnvSource } from "./loader.js";
import { resolveTemplate } from "./resolver.js";

export {
  InvalidValueError,
  MissingEnvError,
  SchemaDefinitionError,
  SettingsError,
  SettingsValidationError,
} from "./errors.js";
export type {
  EnvKey,
  FieldDef,
} from "./fields.js";
export const fields = _fields;

// ── SettingsSchema / Type inference ────────────────────────────────────────────

export type SettingsSchema = Record<string, unknown>;

type InferValue<T> =
  T extends FieldDef<infer V>
    ? V
    : T extends globalThis.Date
      ? T
      : T extends readonly unknown[]
        ? T
        : T extends object
          ? null extends T
            ? T
            : { [K in keyof T]: InferValue<T[K]> }
          : T;

export type InferSettings<T extends SettingsSchema> = {
  [K in keyof T]: InferValue<T[K]>;
};

// ── SettingsOptions ───────────────────────────────────────────────────────────

/** Options for {@link loadSettings}. */
export interface SettingsOptions {
  /** Prefix prepended to all environment variable keys (e.g. "APP_"). */
  prefix?: string;
  /** Path to a .env file to load. Does not pollute `process.env`. */
  envFile?: string;
}

// ── プレーンオブジェクト判定 ──────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

// ── resolve ───────────────────────────────────────────────────────────────────

/**
 * Recursively resolves a single value from the schema.
 * - `FieldDef` (non-template): calls `_resolve()`
 * - Template field: returns `undefined` (resolved in Pass 2)
 * - Date / Array / primitive: returned as-is (constant value)
 * - Plain object: recurses into each entry
 * Errors are collected into the `errors` array; problematic values return `undefined`.
 */
function resolveValue(
  value: unknown,
  schemaKey: string,
  prefix: string,
  env: EnvSource,
  errors: SettingsError[],
): unknown {
  if (isField(value)) {
    if (isTemplateField(value)) return undefined; // Pass 2 で解決
    try {
      return value._resolve(schemaKey, prefix, env);
    } catch (error) {
      if (error instanceof SettingsError) {
        errors.push(error);
        return undefined;
      }
      throw error;
    }
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveValue(v, k, prefix, env, errors)]),
    );
  }
  return value;
}

/**
 * Pass 2: Recursively resolves template fields using the already-resolved values.
 * Errors are collected; resolution continues even if some templates fail.
 */
function resolveTemplates(
  schema: Record<string, unknown>,
  resolved: Record<string, unknown>,
  root: Record<string, unknown>,
  errors: SettingsError[],
): void {
  for (const [key, value] of Object.entries(schema)) {
    if (isTemplateField(value)) {
      try {
        resolved[key] = resolveTemplate(value._template, root);
      } catch (error) {
        if (error instanceof SettingsError) {
          errors.push(error);
          continue;
        }
        throw error;
      }
    } else if (isPlainObject(value)) {
      resolveTemplates(value, resolved[key] as Record<string, unknown>, root, errors);
    }
  }
}

// ── loadSettings ─────────────────────────────────────────────────────────────

/**
 * Creates a type-safe settings object from a schema definition.
 *
 * Validates all fields before throwing, so you see all errors at once.
 * If one or more validations fail, throws {@link SettingsValidationError}.
 *
 * @param schema - The settings schema definition
 * @param options - Options for loading (prefix, envFile)
 * @returns The resolved settings object
 * @throws {SettingsValidationError} When one or more field validations fail
 */
export function loadSettings<const T extends SettingsSchema>(
  schema: T,
  options: SettingsOptions = {},
): InferSettings<T> {
  const { prefix = "", envFile } = options;
  const env = buildEnvSource(envFile);

  const errors: SettingsError[] = [];
  const result: Record<string, unknown> = {};

  // Pass 1: テンプレート以外を解決（エラーは集約）
  for (const [key, value] of Object.entries(schema)) {
    result[key] = resolveValue(value, key, prefix, env, errors);
  }

  // Pass 2: テンプレートを解決（Pass 1 でエラーがあればスキップ — 依存先が undefined の誤報を防ぐ）
  if (errors.length === 0) {
    resolveTemplates(schema, result, result, errors);
  }

  if (errors.length > 0) throw new SettingsValidationError(errors);

  return result as InferSettings<T>;
}
