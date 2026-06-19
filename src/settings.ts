import { FrozenSettingsError } from "./errors.js";
import { validateAll } from "./resolver.js";
import { isAsyncCell, makeSchemaChildProxy, type Store } from "./store.js";
import { isPlainObject } from "./utils.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeepPartial<T> = T extends Date
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in Exclude<keyof T, `$${string}`>]?: DeepPartial<T[K]> }
      : T;

/**
 * Wraps the Store and returns a Proxy that provides access to $value/$resolve/$refresh/$onChange/$versions
 * via schema keys. Also attaches $mutate/$reset/$load.
 *
 * @param store - Store instance returned by buildStore
 * @param frozen - When true, disables mutate/reset
 */
export function createSettingsProxy<T extends Record<string, unknown>>(
  store: Store,
  frozen: boolean,
): T & { $mutate(overrides: DeepPartial<T>): void; $reset(): void; $load(): Promise<void> } {
  function makeAccessor(storeKey: string): unknown {
    const cell = store.cells.get(storeKey);
    if (!cell) return undefined;

    if (isAsyncCell(cell)) {
      const base = {
        $resolve: () => store.resolveAsync(storeKey),
        $refresh: () => store.refresh(storeKey),
        get $versions() {
          return cell.versions;
        },
        $onChange: (cb: (n: unknown, o: unknown) => void) => {
          cell.listeners.add(cb);
          return () => cell.listeners.delete(cb);
        },
      };

      // secrets with schema, etc.: add child accessors for keys in the resolved value
      const schema = cell.typeDef._schema;
      if (!schema) return base;

      return makeSchemaChildProxy(base as Record<string, unknown>, schema);
    }

    return {
      $value: () => store.resolveSync(storeKey),
      $resolve: () => Promise.resolve(store.resolveSync(storeKey)),
      $refresh: () => Promise.resolve(store.resolveSync(storeKey)),
      get $versions() {
        return cell.versions;
      },
      $onChange: (cb: (n: unknown, o: unknown) => void) => {
        cell.listeners.add(cb);
        return () => cell.listeners.delete(cb);
      },
    };
  }

  /** Enumerates cell keys directly under the given prefix (one dot level). */
  function directChildKeys(prefix: string): { storeKey: string; rest: string }[] {
    const pfx = `${prefix}.`;
    const result: { storeKey: string; rest: string }[] = [];
    for (const k of store.cells.keys()) {
      if (!k.startsWith(pfx)) continue;
      const rest = k.slice(pfx.length);
      if (!rest.includes(".")) result.push({ storeKey: k, rest });
    }
    return result;
  }

  /** Returns the accessor or group proxy for the given storeKey, or undefined if not found. */
  function resolveKey(storeKey: string): unknown {
    if (store.hasChildCells(storeKey)) return makeGroupProxy(storeKey);
    return makeAccessor(storeKey);
  }

  /** Returns a PropertyDescriptor for the given storeKey if it exists, otherwise undefined. */
  function makeDescriptor(storeKey: string): PropertyDescriptor | undefined {
    if (!store.cells.has(storeKey) && !store.hasChildCells(storeKey)) return undefined;
    return { configurable: true, enumerable: true, writable: false, value: resolveKey(storeKey) };
  }

  function makeGroupProxy(prefix: string): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop !== "string") return undefined;
          // Synchronously retrieve the entire group as an object
          if (prop === "$value") {
            return () => {
              const out: Record<string, unknown> = {};
              for (const { storeKey, rest } of directChildKeys(prefix)) {
                const acc = makeAccessor(storeKey) as { $value?: () => unknown } | undefined;
                out[rest] = acc?.$value?.();
              }
              return out;
            };
          }
          // Asynchronously resolve the entire group
          if (prop === "$resolve") {
            return async () => {
              const out: Record<string, unknown> = {};
              for (const { storeKey, rest } of directChildKeys(prefix)) {
                const acc = makeAccessor(storeKey) as { $resolve(): Promise<unknown> } | undefined;
                if (acc) out[rest] = await acc.$resolve();
              }
              return out;
            };
          }
          return resolveKey(`${prefix}.${prop}`);
        },
        has(_target, prop) {
          if (typeof prop !== "string") return false;
          const storeKey = `${prefix}.${prop}`;
          return store.cells.has(storeKey) || store.hasChildCells(storeKey);
        },
        ownKeys() {
          const topKeys = new Set<string>();
          const depth = prefix.split(".").length;
          for (const k of store.cells.keys()) {
            if (k.startsWith(`${prefix}.`)) {
              topKeys.add(k.split(".")[depth]);
            }
          }
          return [...topKeys];
        },
        getOwnPropertyDescriptor(_target, prop) {
          if (typeof prop !== "string") return undefined;
          return makeDescriptor(`${prefix}.${prop}`);
        },
        set() {
          return false;
        },
      },
    );
  }

  const $mutate = (overrides: DeepPartial<T>): void => {
    if (frozen) throw new FrozenSettingsError();
    flatMutate(store, overrides as Record<string, unknown>, "");
  };

  const $reset = (): void => {
    if (frozen) throw new FrozenSettingsError();
    store.reset();
  };

  const $load = (): Promise<void> => validateAll(store);

  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === "$mutate") return $mutate;
      if (prop === "$reset") return $reset;
      if (prop === "$load") return $load;
      if (typeof prop !== "string") return undefined;
      return resolveKey(prop);
    },
    has(_target, prop) {
      if (prop === "$mutate" || prop === "$reset" || prop === "$load") return true;
      if (typeof prop !== "string") return false;
      return store.cells.has(prop) || store.hasChildCells(prop);
    },
    ownKeys() {
      const topKeys = new Set<string>();
      for (const k of store.cells.keys()) {
        topKeys.add(k.split(".")[0]);
      }
      return [...topKeys];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return makeDescriptor(prop);
    },
    set() {
      return false;
    },
  }) as T & { $mutate(overrides: DeepPartial<T>): void; $reset(): void; $load(): Promise<void> };
}

function flatMutate(store: Store, partial: Record<string, unknown>, prefix: string): void {
  for (const [key, value] of Object.entries(partial)) {
    if (key.startsWith("$")) continue;
    const storeKey = prefix ? `${prefix}.${key}` : key;
    // If a direct cell exists (e.g. a secret with an object schema), overwrite the entire value even for objects.
    // Only recurse into mutate for groups that have child cells.
    if (isPlainObject(value) && !store.cells.has(storeKey) && store.hasChildCells(storeKey)) {
      flatMutate(store, value as Record<string, unknown>, storeKey);
    } else {
      store.mutate(storeKey, value);
    }
  }
}
