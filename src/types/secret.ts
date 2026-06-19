import type { SecretAdapter } from "../adapters/types.js";
import { InvalidValueError, MissingEnvError, SchemaDefinitionError } from "../errors.js";
import { getAdapter } from "../secret.js";
import { tryParseJson } from "../utils.js";
import type { BaseOptions, InferRawSettings, SettingsSchema, TypeDef } from "./core.js";
import { func } from "./factories.js";

export interface SecretOptions<T = unknown, S extends SettingsSchema = SettingsSchema>
  extends BaseOptions<T> {
  adapter: SecretAdapter | string;
  schema?: S;
  ttl?: number;
}

/**
 * Defines a secret field.
 * Implemented internally as a thin wrapper over func(). TTL caching, $refresh, $onChange, and $versions
 * are provided as shared func capabilities.
 * Fetches and returns a secret value from the adapter.
 *
 * @param opts.adapter - SecretAdapter implementation or registered adapter name used to fetch the secret
 * @param opts.schema - Sub-schema for resolving the fetched JSON
 * @param opts.ttl - Cache expiration in milliseconds
 * @param opts.optional - When true, returns undefined if the adapter key is not set
 */
export function secret<S extends SettingsSchema>(
  opts: SecretOptions<never, S> & { schema: S; optional: true },
): TypeDef<Promise<InferRawSettings<S> | undefined>> & { readonly _schema: S };
export function secret<S extends SettingsSchema>(
  opts: SecretOptions<never, S> & { schema: S },
): TypeDef<Promise<InferRawSettings<S>>> & { readonly _schema: S };
export function secret<T = string>(
  opts: SecretOptions<T> & { optional: true },
): TypeDef<Promise<T | undefined>>;
export function secret<T = string>(opts: SecretOptions<T>): TypeDef<Promise<T>>;
export function secret<T = string, S extends SettingsSchema = SettingsSchema>(
  opts: SecretOptions<T, S>,
): TypeDef<unknown> {
  const td = func(
    async (ctx) => {
      const raw = ctx.raw;
      if (raw === undefined) {
        if (opts.optional) return undefined;
        // When schema is specified, resolve the sub-schema with an empty base (delegating to each field's default/optional)
        if (opts.schema && ctx.resolve) {
          const value = await ctx.resolve(opts.schema as Record<string, unknown>, {}, ctx.envKey);
          return { $value: value, $meta: {} };
        }
        throw new MissingEnvError();
      }

      const adapter = typeof opts.adapter === "string" ? getAdapter(opts.adapter) : opts.adapter;
      if (!adapter) {
        throw new SchemaDefinitionError(
          typeof opts.adapter === "string"
            ? `Secret adapter "${opts.adapter}" is not registered`
            : "Secret adapter is required",
        );
      }

      let fetched: { value: string; versionId?: string; leaseDuration?: number };
      try {
        fetched = await adapter.fetch(raw);
      } catch (err) {
        throw InvalidValueError.forField(
          raw,
          `Secret adapter "${adapter.provider}" failed: ${(err as Error).message}`,
        );
      }

      const parsed = tryParseJson(fetched.value);

      let value: unknown = parsed;
      if (opts.schema && typeof parsed === "object" && parsed !== null && ctx.resolve) {
        value = await ctx.resolve(
          opts.schema as Record<string, unknown>,
          parsed as Record<string, unknown>,
          ctx.envKey,
        );
      }

      return { $value: value, $meta: { version: fetched.versionId } };
    },
    { ttl: opts.ttl, key: opts.key, prefix: opts.prefix },
  ) as TypeDef<unknown>;

  if (opts.schema) {
    return { ...td, _schema: opts.schema } as TypeDef<unknown>;
  }
  return td;
}
