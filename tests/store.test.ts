import { describe, expect, it, vi } from "vitest";
import { Store } from "../src/store.js";
import type { TypeDef } from "../src/types/core.js";
import { createTypeDef } from "../src/types/core.js";

function syncDef(value: unknown): TypeDef<unknown> {
  return createTypeDef({ _resolve: () => value });
}

function asyncDef(fn: () => Promise<unknown>, ttl?: number): TypeDef<unknown> {
  return createTypeDef({
    _resolve: fn,
    _async: true as const,
    ...(ttl !== undefined && { _cache: { ttl } }),
  });
}

describe("Store.resolveSync", () => {
  it("throws SchemaDefinitionError for unregistered key", () => {
    const store = new Store();
    expect(() => store.resolveSync("UNKNOWN")).toThrow("Unknown field: UNKNOWN");
  });

  it("returns the immediate value for a sync field", () => {
    const store = new Store();
    store.register("PORT", syncDef(3000), "PORT", {});
    expect(store.resolveSync("PORT")).toBe(3000);
  });

  it("returns the override value when an override is present", () => {
    const store = new Store();
    store.register("PORT", syncDef(3000), "PORT", {});
    store.mutate("PORT", 9999);
    expect(store.resolveSync("PORT")).toBe(9999);
  });

  it("throws when _resolve returns a Promise", () => {
    const store = new Store();
    store.register("KEY", createTypeDef({ _resolve: () => Promise.resolve("secret") }), "KEY", {});
    expect(() => store.resolveSync("KEY")).toThrow("async");
  });
});

describe("Store.mutate", () => {
  it("throws SchemaDefinitionError for unregistered key", () => {
    const store = new Store();
    expect(() => store.mutate("UNKNOWN", "v")).toThrow("Unknown field: UNKNOWN");
  });
});

describe("Store.resolveAsync", () => {
  it("throws SchemaDefinitionError for unregistered key", async () => {
    const store = new Store();
    await expect(store.resolveAsync("UNKNOWN")).rejects.toThrow("Unknown field: UNKNOWN");
  });

  it("returns an async field as a Promise", async () => {
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => Promise.resolve("fetched")),
      "KEY",
      {},
    );
    expect(await store.resolveAsync("KEY")).toBe("fetched");
  });

  it("returns cached value without re-resolving within TTL", async () => {
    let callCount = 0;
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => {
        callCount++;
        return Promise.resolve("v1");
      }, 60_000),
      "KEY",
      {},
    );
    await store.resolveAsync("KEY");
    await store.resolveAsync("KEY");
    expect(callCount).toBe(1);
  });

  it("re-resolves after TTL expiry", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => {
        callCount++;
        return Promise.resolve(`v${callCount}`);
      }, 1000),
      "KEY",
      {},
    );
    await store.resolveAsync("KEY");
    vi.advanceTimersByTime(1001);
    const result = await store.resolveAsync("KEY");
    expect(callCount).toBe(2);
    expect(result).toBe("v2");
    vi.useRealTimers();
  });

  it("calls onChange listeners on value change", async () => {
    let callCount = 0;
    let capturedNext: unknown;
    vi.useFakeTimers();
    const store = new Store();
    const def = asyncDef(() => Promise.resolve(`v${++callCount}`), 1000);
    store.register("KEY", def, "KEY", {});
    const cell = store.cells.get("KEY");
    if (!cell) throw new Error("cell not found");
    cell.listeners.add((next, _prev) => {
      capturedNext = next;
    });
    await store.resolveAsync("KEY"); // fetch v1
    vi.advanceTimersByTime(1001);
    await store.resolveAsync("KEY"); // fetch v2 → onChange fires
    expect(capturedNext).toBe("v2");
    vi.useRealTimers();
  });

  it("deduplicates concurrent calls", async () => {
    let callCount = 0;
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => {
        callCount++;
        return Promise.resolve("v");
      }),
      "KEY",
      {},
    );
    await Promise.all([store.resolveAsync("KEY"), store.resolveAsync("KEY")]);
    expect(callCount).toBe(1);
  });
});

describe("Store.refresh", () => {
  it("throws SchemaDefinitionError for unregistered key", async () => {
    const store = new Store();
    await expect(store.refresh("UNKNOWN")).rejects.toThrow("Unknown field: UNKNOWN");
  });

  it("resets resolvedAt and re-resolves", async () => {
    let callCount = 0;
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => {
        callCount++;
        return Promise.resolve(`v${callCount}`);
      }, 60_000),
      "KEY",
      {},
    );
    await store.resolveAsync("KEY");
    const result = await store.refresh("KEY");
    expect(callCount).toBe(2);
    expect(result).toBe("v2");
  });
});

describe("Store.makeValuesProxy", () => {
  it("returns undefined for non-string props", () => {
    const store = new Store();
    store.register("KEY", syncDef("v"), "KEY", { KEY: "v" });
    const proxy = store.makeValuesProxy();
    expect(Reflect.get(proxy, Symbol.for("test"))).toBeUndefined();
  });

  it("$resolve on a sync cell returns a value wrapped in Promise.resolve", async () => {
    const store = new Store();
    store.register("KEY", syncDef("hello"), "KEY", { KEY: "hello" });
    const proxy = store.makeValuesProxy();
    const acc = proxy.KEY as { $resolve(): Promise<unknown>; $refresh(): Promise<unknown> };
    expect(await acc.$resolve()).toBe("hello");
    expect(await acc.$refresh()).toBe("hello");
  });

  it("$onChange on a sync cell can register and unregister listeners", () => {
    const store = new Store();
    store.register("KEY", syncDef("v"), "KEY", { KEY: "v" });
    const proxy = store.makeValuesProxy();
    const acc = proxy.KEY as { $onChange(cb: (n: unknown, o: unknown) => void): () => void };
    const cb = () => {};
    const off = acc.$onChange(cb);
    const cell = store.cells.get("KEY");
    if (!cell) throw new Error("cell not found");
    expect(cell.listeners.has(cb)).toBe(true);
    off();
    expect(cell.listeners.has(cb)).toBe(false);
  });

  it("can access $versions on a sync cell", () => {
    const store = new Store();
    store.register("KEY", syncDef("v"), "KEY", { KEY: "v" });
    const proxy = store.makeValuesProxy();
    const acc = proxy.KEY as { $versions: string[] };
    expect(Array.isArray(acc.$versions)).toBe(true);
  });

  it("$value() on an async cell throws an exception and $versions is accessible", async () => {
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => Promise.resolve("v")),
      "KEY",
      {},
    );
    const proxy = store.makeValuesProxy();
    const acc = proxy.KEY as { $value(): unknown; $versions: string[] };
    expect(() => acc.$value()).toThrow("async");
    expect(Array.isArray(acc.$versions)).toBe(true);
  });

  it("$refresh and $onChange work on async cells", async () => {
    let callCount = 0;
    const store = new Store();
    store.register(
      "KEY",
      asyncDef(() => {
        callCount++;
        return Promise.resolve(`v${callCount}`);
      }, 0),
      "KEY",
      {},
    );
    const proxy = store.makeValuesProxy();
    const acc = proxy.KEY as {
      $refresh(): Promise<unknown>;
      $onChange(cb: (n: unknown, o: unknown) => void): () => void;
    };

    const result = await acc.$refresh();
    expect(result).toBe("v1");

    const cb = vi.fn();
    const off = acc.$onChange(cb);
    const cell = store.cells.get("KEY");
    if (!cell) throw new Error("cell not found");
    expect(cell.listeners.has(cb)).toBe(true);
    off();
    expect(cell.listeners.has(cb)).toBe(false);
  });

  it("$refresh and the has trap work on async cells with _schema", async () => {
    const schema = { host: {} };
    const store = new Store();
    const def = createTypeDef({
      _resolve: async () => ({ host: "localhost" }),
      _async: true as const,
      _schema: schema,
    });
    store.register("KEY", def, "KEY", {});
    const proxy = store.makeValuesProxy();
    const acc = proxy.KEY as Record<string, unknown>;

    const child = acc.host as { $refresh(): Promise<unknown> };
    expect(await child.$refresh()).toBe("localhost");
    expect("host" in acc).toBe(true);
    expect("unknown" in acc).toBe(false);
    expect(acc.unknown).toBeUndefined();
  });
});
