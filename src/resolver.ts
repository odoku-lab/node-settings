import {
  InvalidValueError,
  MissingEnvError,
  SchemaDefinitionError,
  SettingsError,
  SettingsValidationError,
} from "./errors.js";
import { isAsyncCell, Store } from "./store.js";
import type { EnvSource, ResolveCtx, TypeDef } from "./types/core.js";
import { createTypeDef, isType, resolveKeys } from "./types/core.js";
import { maskQuotedValues, SECRET_PATTERN, toConstantCase } from "./utils.js";

/**
 * Traverses the schema and registers fields in the Store (synchronous).
 * Each field is resolved lazily on $value() / $resolve() call.
 */
export function buildStore(
  schema: Record<string, unknown>,
  prefix: string,
  source: EnvSource,
  maskSecrets: boolean,
  changeCase: boolean,
): Store {
  const store = new Store();
  const resolveFn = createResolveFn(source, maskSecrets);
  store.resolveFn = resolveFn;
  registerFields(store, schema, prefix, source, maskSecrets, changeCase, "", resolveFn);
  return store;
}

function registerFields(
  store: Store,
  schema: Record<string, unknown>,
  prefix: string,
  source: EnvSource,
  maskSecrets: boolean,
  changeCase: boolean,
  groupPath: string,
  resolveFn: NonNullable<ResolveCtx["resolve"]>,
  // The group key portion (e.g. "GROUP_"). The child field's prefix option is prepended before this.
  groupKey = "",
): void {
  for (const [key, value] of Object.entries(schema)) {
    // Raw values that are not TypeDef are registered as constants
    if (!isType(value)) {
      const storeKey = groupPath ? `${groupPath}.${key}` : key;
      store.register(storeKey, createTypeDef({ _resolve: () => value }), "", source);
      continue;
    }

    const td = value as TypeDef<unknown>;
    const resolvedKey = changeCase ? toConstantCase(key) : key;

    // t.object() group: recursively register child fields
    if (td._objectType && td._schema) {
      // When _objectPrefix is specified, treat it as a global prefix override and reset the ancestor groupKey.
      // Otherwise, inherit the ancestor groupKey.
      const groupPrefix = td._objectPrefix ?? prefix;
      const parentGroupKey = td._objectPrefix !== undefined ? "" : groupKey;
      const childGroupKey = `${parentGroupKey}${resolvedKey}_`;
      const childPath = groupPath ? `${groupPath}.${key}` : key;
      registerFields(
        store,
        td._schema,
        groupPrefix,
        source,
        maskSecrets,
        changeCase,
        childPath,
        resolveFn,
        childGroupKey,
      );
      continue;
    }

    const { envKey, fieldName } = resolveKeys(
      value as TypeDef<unknown>,
      resolvedKey,
      prefix,
      groupKey,
    );
    const isSecretField = Boolean(maskSecrets && SECRET_PATTERN.test(fieldName));
    const storeKey = groupPath ? `${groupPath}.${key}` : key;

    const mapError = (error: unknown): never => {
      if (error instanceof MissingEnvError) throw new MissingEnvError(fieldName);
      if (error instanceof InvalidValueError) {
        const msg = isSecretField ? maskQuotedValues(error.message) : error.message;
        throw InvalidValueError.forField(fieldName, msg);
      }
      if (error instanceof SchemaDefinitionError) {
        throw new SchemaDefinitionError(`"${fieldName}": ${error.message}`);
      }
      throw error;
    };

    // To preserve synchronous field behavior, errors are converted asynchronously only when _resolve returns a Promise.
    const wrappedDef: TypeDef<unknown> = {
      ...td,
      _resolve: (ctx: ResolveCtx) => {
        let result: unknown;
        try {
          result = td._resolve(ctx);
        } catch (error) {
          return mapError(error);
        }
        if (result instanceof Promise) return result.catch(mapError);
        return result;
      },
    };

    store.register(storeKey, wrappedDef, envKey, source);
  }
}

/**
 * Creates a sub-schema resolution function used for internal resolution of t.secret({ schema }).
 */
function createResolveFn(
  envSource: EnvSource,
  maskSecrets: boolean,
): NonNullable<ResolveCtx["resolve"]> {
  const self: NonNullable<ResolveCtx["resolve"]> = async (
    subSchema: Record<string, unknown>,
    base: Record<string, unknown>,
    envPrefix?: string,
  ) => {
    const src: EnvSource = {};
    for (const [k, v] of Object.entries(base)) {
      src[k] = v == null ? undefined : String(v);
    }
    // When envPrefix (e.g. "INFRA_DB") is specified, override "${envPrefix}_KEY" from envSource
    // as "key" (lowercase), taking priority over base values.
    // Without envPrefix, all keys from envSource are merged into src as usual.
    if (envPrefix) {
      const pfx = `${envPrefix}_`;
      for (const [k, v] of Object.entries(envSource)) {
        if (v !== undefined && k.startsWith(pfx)) {
          src[k.slice(pfx.length).toLowerCase()] = v;
        }
      }
    } else {
      for (const [k, v] of Object.entries(envSource)) {
        if (v !== undefined) src[k] = v;
      }
    }

    const subStore = new Store();
    subStore.resolveFn = self;
    registerFields(subStore, subSchema, "", src, maskSecrets, false, "", self);

    const out: Record<string, unknown> = {};
    const errors: SettingsError[] = [];
    for (const [k, cell] of subStore.cells) {
      try {
        out[k] = isAsyncCell(cell) ? await subStore.resolveAsync(k) : subStore.resolveSync(k);
      } catch (error) {
        if (error instanceof SettingsError) errors.push(error);
        else throw error;
      }
    }
    if (errors.length > 0) throw new SettingsValidationError(errors);
    return out;
  };

  return self;
}

/**
 * Calls $value() / $resolve() on all fields to validate them in bulk (optional).
 */
export async function validateAll(store: Store): Promise<void> {
  const errors: SettingsError[] = [];

  for (const [key, cell] of store.cells) {
    try {
      if (isAsyncCell(cell)) await store.resolveAsync(key);
      else store.resolveSync(key);
    } catch (error) {
      if (error instanceof SettingsError) errors.push(error);
      else throw error;
    }
  }

  if (errors.length > 0) throw new SettingsValidationError(errors);
}
