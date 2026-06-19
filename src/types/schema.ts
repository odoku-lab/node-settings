import { InvalidValueError, SchemaDefinitionError } from "../errors.js";
import type { ResolveCtx, TypeDef } from "./core.js";
import { createTypeDef } from "./core.js";

// ── ZodSchema ───────────────────────────────────────────────────────────────

type ZodLike<T> = { parse(value: unknown): T };

interface ZodSchemaOptions<TSchema extends ZodLike<unknown>> {
  key?: string;
  prefix?: string;
  schema: TSchema;
  optional?: boolean;
}

/**
 * Defines a TypeDef that validates a field using a Zod schema.
 * Passes the raw env var string to `schema.parse()` and throws `InvalidValueError` on failure.
 *
 * @param opts.schema - Zod schema used for validation
 * @param opts.optional - When true, returns undefined if not set
 */
export function zodSchema<TSchema extends ZodLike<unknown>>(
  opts: ZodSchemaOptions<TSchema> & { optional: true },
): TypeDef<ReturnType<TSchema["parse"]> | undefined>;
export function zodSchema<TSchema extends ZodLike<unknown>>(
  opts: ZodSchemaOptions<TSchema>,
): TypeDef<ReturnType<TSchema["parse"]>>;
export function zodSchema<TSchema extends ZodLike<unknown>>(
  opts: ZodSchemaOptions<TSchema>,
): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts.key,
    prefix: opts.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      if (raw === undefined && opts.optional) return undefined;
      try {
        return opts.schema.parse(raw);
      } catch (error) {
        throw InvalidValueError.forMessage(
          error instanceof Error ? error.message : globalThis.String(error),
        );
      }
    },
  });
}

// ── ValibotSchema ───────────────────────────────────────────────────────────

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

interface ValibotSchemaOptions<TSchema> {
  key?: string;
  prefix?: string;
  schema: TSchema;
  optional?: boolean;
}

/**
 * Defines a TypeDef that validates a field using a Standard Schema v1 (e.g. Valibot) compatible schema.
 * Async schemas are not supported.
 *
 * @param opts.schema - Schema implementing the Standard Schema v1 interface
 * @param opts.optional - When true, returns undefined if not set
 */
export function valibotSchema<TSchema>(
  opts: ValibotSchemaOptions<TSchema> & { optional: true },
): TypeDef<InferStandardOutput<TSchema> | undefined>;
export function valibotSchema<TSchema>(
  opts: ValibotSchemaOptions<TSchema>,
): TypeDef<InferStandardOutput<TSchema>>;
export function valibotSchema<TSchema>(opts: ValibotSchemaOptions<TSchema>): TypeDef<unknown> {
  return createTypeDef<unknown>({
    key: opts.key,
    prefix: opts.prefix,
    _resolve({ raw }: ResolveCtx): unknown {
      if (raw === undefined && opts.optional) return undefined;

      const schemaObj = opts.schema as Record<string, unknown>;
      if (!("~standard" in schemaObj) || typeof schemaObj["~standard"] !== "object") {
        throw new SchemaDefinitionError(
          "ValibotSchema: schema does not implement Standard Schema interface",
        );
      }
      const schema = opts.schema as unknown as StandardSchemaV1<unknown>;
      const result = schema["~standard"].validate(raw);
      if (result instanceof Promise) {
        throw new SchemaDefinitionError("ValibotSchema: async schemas are not supported");
      }
      if (result.issues && result.issues.length > 0) {
        throw InvalidValueError.forMessage(result.issues.map((i) => i.message).join(", "));
      }
      return result.value;
    },
  });
}
