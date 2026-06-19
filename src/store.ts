import { SchemaDefinitionError } from "./errors.js";
import type { EnvSource, ResolveCtx, TypeDef, ValuesProxy } from "./types/core.js";

type MetaResult = { $value: unknown; $meta?: { version?: string } };

function unwrapMeta(result: unknown): { value: unknown; version?: string } {
  if (result !== null && typeof result === "object" && "$value" in result) {
    const r = result as MetaResult;
    return { value: r.$value, version: r.$meta?.version };
  }
  return { value: result };
}

export type Cell = {
  resolvedAt?: number;
  value?: unknown;
  override?: { value: unknown };
  inflight?: Promise<unknown>;
  listeners: Set<(next: unknown, prev: unknown) => void>;
  versions: string[];
  typeDef: TypeDef<unknown>;
  envKey: string;
  source: EnvSource;
};

/** Determines whether a field is asynchronous (requires $resolve()). */
export function isAsyncCell(cell: Cell): boolean {
  return cell.typeDef._async === true || cell.typeDef._cache !== undefined;
}

/**
 * Returns a Proxy that adds child property access to the base accessor of an async cell with `_schema`.
 * Used by both makeAccessor in settings.ts and makeValuesProxy in store.ts.
 */
export function makeSchemaChildProxy(
  base: Record<string, unknown>,
  schema: Record<string, unknown>,
): unknown {
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== "string" || prop in target) return target[prop as keyof typeof target];
      if (!(prop in schema)) return undefined;
      return {
        $resolve: async () => {
          const resolved = (await (base.$resolve as () => Promise<unknown>)()) as Record<
            string,
            unknown
          >;
          return resolved?.[prop];
        },
        $refresh: async () => {
          const resolved = (await (base.$refresh as () => Promise<unknown>)()) as Record<
            string,
            unknown
          >;
          return resolved?.[prop];
        },
      };
    },
    has(target, prop) {
      return prop in target || (typeof prop === "string" && prop in schema);
    },
  });
}

export class Store {
  readonly cells = new Map<string, Cell>();
  /** Cache of registered group keys. Reduces O(n) traversal in hasChildCells() to O(1). */
  private readonly groupKeys = new Set<string>();
  resolveFn?: (
    schema: Record<string, unknown>,
    base: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;

  register(key: string, typeDef: TypeDef<unknown>, envKey: string, source: EnvSource): void {
    this.cells.set(key, {
      typeDef,
      envKey,
      source,
      listeners: new Set(),
      versions: [],
    });
    // Add all ancestor segments to the group key cache
    let i = key.lastIndexOf(".");
    while (i !== -1) {
      this.groupKeys.add(key.slice(0, i));
      i = key.lastIndexOf(".", i - 1);
    }
  }

  /** Determines whether the given key is a group that has child cells. */
  hasChildCells(key: string): boolean {
    return this.groupKeys.has(key);
  }

  private getCell(key: string): Cell {
    const cell = this.cells.get(key);
    if (!cell) throw new SchemaDefinitionError(`Unknown field: ${key}`);
    return cell;
  }

  private makeCtx(cell: Cell, key: string): ResolveCtx {
    return {
      raw: cell.source[cell.envKey],
      source: cell.source,
      values: this.makeValuesProxy(groupPrefixOf(key)),
      resolve: this.resolveFn,
      envKey: cell.envKey,
    };
  }

  resolveSync(key: string): unknown {
    const cell = this.getCell(key);
    if (cell.override !== undefined) return cell.override.value;
    const result = cell.typeDef._resolve(this.makeCtx(cell, key));
    if (result instanceof Promise) {
      throw new SchemaDefinitionError(
        `Field "${key}" is async; use $resolve() instead of $value()`,
      );
    }
    cell.value = result;
    cell.resolvedAt = Date.now();
    return result;
  }

  mutate(key: string, value: unknown): void {
    this.getCell(key).override = { value };
  }

  reset(): void {
    for (const cell of this.cells.values()) {
      if (cell.override !== undefined) {
        cell.override = undefined;
        // Async fields that were overridden should be re-resolved after reset
        if (isAsyncCell(cell)) cell.resolvedAt = undefined;
      }
    }
  }

  async resolveAsync(key: string): Promise<unknown> {
    const cell = this.getCell(key);
    if (cell.override !== undefined) return cell.override.value;

    const ttl = cell.typeDef._cache?.ttl;
    // No TTL (undefined): use the cache permanently once resolved
    // With TTL (> 0): use the cache within TTL period, re-resolve when expired
    if (cell.resolvedAt !== undefined) {
      if (ttl === undefined || (ttl > 0 && Date.now() - cell.resolvedAt < ttl)) {
        return cell.value;
      }
    }

    if (cell.inflight) return cell.inflight;

    cell.inflight = (async () => {
      const prev = cell.value;
      const raw = await cell.typeDef._resolve(this.makeCtx(cell, key));
      const { value, version } = unwrapMeta(raw);
      cell.value = value;
      cell.resolvedAt = Date.now();
      if (version) cell.versions.push(version);
      if (value !== prev && cell.listeners.size > 0) {
        for (const cb of cell.listeners) cb(value, prev);
      }
      return value;
    })().finally(() => {
      cell.inflight = undefined;
    });

    return cell.inflight;
  }

  async refresh(key: string): Promise<unknown> {
    const cell = this.getCell(key);
    cell.resolvedAt = undefined;
    return this.resolveAsync(key);
  }

  /**
   * Creates a Proxy that provides access to fields under the given prefix.
   * Sync fields are accessed via `values.FOO.$value()` and async fields via `values.FOO.$resolve()`.
   * Group fields return a Proxy of the same shape for `values.GROUP`.
   *
   * When a reference is not found in the group scope (with prefix), it falls back to the root scope.
   * This allows `{HOST}` in a group template to reference a child of the same group,
   * while `{OTHER.HOST}` can reference a different top-level group.
   *
   * @param prefix - Key prefix for the group (empty string for top-level)
   */
  makeValuesProxy(prefix = ""): ValuesProxy {
    const resolveProp = (scopeKey: string): unknown => {
      if (this.hasChildCells(scopeKey)) return this.makeValuesProxy(scopeKey);
      const cell = this.cells.get(scopeKey);
      if (!cell) return undefined;
      if (isAsyncCell(cell)) {
        const base = {
          $value: () => {
            throw new Error(`Field "${scopeKey}" is async; use $resolve() instead of $value()`);
          },
          $resolve: () => this.resolveAsync(scopeKey),
          $refresh: () => this.refresh(scopeKey),
          get $versions() {
            return cell.versions;
          },
          $onChange: (cb: (n: unknown, o: unknown) => void) => {
            cell.listeners.add(cb);
            return () => cell.listeners.delete(cb);
          },
        };
        const schema = cell.typeDef._schema;
        if (!schema) return base;
        return makeSchemaChildProxy(base as Record<string, unknown>, schema);
      }
      return {
        $value: () => this.resolveSync(scopeKey),
        $resolve: () => Promise.resolve(this.resolveSync(scopeKey)),
        $refresh: () => Promise.resolve(this.resolveSync(scopeKey)),
        get $versions() {
          return cell.versions;
        },
        $onChange: (cb: (n: unknown, o: unknown) => void) => {
          cell.listeners.add(cb);
          return () => cell.listeners.delete(cb);
        },
      };
    };
    return new Proxy({} as ValuesProxy, {
      get: (_target, prop) => {
        if (typeof prop !== "string") return undefined;
        // First try to resolve in the group scope; fall back to root scope if not found
        if (prefix) return resolveProp(`${prefix}.${prop}`) ?? resolveProp(prop);
        return resolveProp(prop);
      },
    });
  }
}

/**
 * Extracts the group prefix (everything except the last segment) from a Store key.
 * @param key - Field key in the Store (e.g. "DB.URL")
 * @returns Group prefix (e.g. "DB"). Empty string for top-level keys.
 */
function groupPrefixOf(key: string): string {
  const lastDot = key.lastIndexOf(".");
  return lastDot === -1 ? "" : key.slice(0, lastDot);
}
