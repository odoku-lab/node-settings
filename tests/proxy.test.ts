import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineSettings, types as t } from "../src/index.js";

const originalEnv = process.env;
beforeEach(async () => {
  process.env = { ...originalEnv };
});
afterEach(async () => {
  process.env = originalEnv;
});

describe("createSettingsProxy: getOwnPropertyDescriptor with non-string prop", () => {
  it("handles Symbol properties", async () => {
    const s = defineSettings({ X: t.string() }, { source: { X: "hello" } });
    const sym = Symbol("test");
    expect(Object.getOwnPropertyDescriptor(s, sym)).toBeUndefined();
  });
});

describe("proxy edge cases", () => {
  it("has trap handles non-string prop", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() });
    expect(Symbol.for("test") in s).toBe(false);
  });

  it("proxy get trap handles non-string prop", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() }) as Record<string, unknown>;
    expect(Reflect.get(s, Symbol.for("test"))).toBeUndefined();
  });

  it("has trap honors mutated fields with prefix", async () => {
    process.env.X = "1";
    process.env.APP_X = "2";
    const s = defineSettings({ X: t.string() }, { prefix: "APP_" });
    s.$mutate({ X: "override" });
    expect("$refreshSecrets" in s).toBe(false);
    expect(s.X.$value()).toBe("override");
    expect("NONEXISTENT" in s).toBe(false);
  });

  it("has trap checks properties in frozen settings", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() }, { frozen: true });
    expect("X" in s).toBe(true);
    expect("NONEXISTENT" in s).toBe(false);
  });

  it("has trap returns true for known override", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() }, { frozen: true });
    expect("$refreshSecrets" in s).toBe(false);
  });

  it("ownKeys includes schema keys", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string(), Y: t.string({ default: "y" }) });
    s.$mutate({ Y: "override" });
    expect(Object.keys(s)).toEqual(expect.arrayContaining(["X", "Y"]));
  });

  it("has trap returns true for mutated field", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string(), Y: t.string({ default: "y" }) });
    s.$mutate({ Y: "override" });
    expect("Y" in s).toBe(true);
    expect(s.Y.$value()).toBe("override");
  });

  it("frozen proxy get trap handles non-string prop", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() }, { frozen: true }) as Record<string, unknown>;
    expect(Reflect.get(s, Symbol.for("test"))).toBeUndefined();
  });

  it("ownKeys with nested group override skips dotted paths", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    s.$mutate({ G: { X: "override" } });
    expect(Object.keys(s)).toEqual(["G"]);
  });

  it("ownKeys on nested proxy strips prefix from override keys", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    s.$mutate({ G: { X: "override" } });
    const g = s.G as Record<string, unknown>;
    expect(Object.keys(g)).toContain("X");
  });

  it("getOwnPropertyDescriptor works for schema key", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() });
    const desc = Object.getOwnPropertyDescriptor(s, "X");
    expect(desc).toBeDefined();
    expect((desc?.value as { $value(): string } | undefined)?.$value()).toBe("1");
  });

  it("getOwnPropertyDescriptor works for mutated key", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string(), Y: t.string({ default: "y" }) });
    s.$mutate({ Y: "override" });
    const desc = Object.getOwnPropertyDescriptor(s, "Y");
    expect(desc).toBeDefined();
    expect((desc?.value as { $value(): string } | undefined)?.$value()).toBe("override");
  });
});

describe("group proxy traps", () => {
  it("has trap returns true for known child field", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect("X" in g).toBe(true);
  });

  it("has trap returns false for unknown field", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect("UNKNOWN" in g).toBe(false);
  });

  it("has trap returns false for non-string Symbol prop", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect(Symbol.for("test") in g).toBe(false);
  });

  it("set trap on group proxy returns false", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect(Reflect.set(g, "X", "new")).toBe(false);
  });

  it("set trap on root proxy returns false", async () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() }) as Record<string, unknown>;
    expect(Reflect.set(s, "X", "new")).toBe(false);
  });

  it("getOwnPropertyDescriptor returns undefined for non-string prop on group proxy", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(g, Symbol.for("test"))).toBeUndefined();
  });

  it("getOwnPropertyDescriptor returns undefined for nonexistent string key on group proxy", async () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(g, "NONEXISTENT")).toBeUndefined();
  });

  it("get on group proxy with non-string Symbol prop returns undefined", () => {
    const s = defineSettings({ G: t.object({ X: t.string({ default: "x" }) }) });
    const g = s.G as Record<string, unknown>;
    expect(Reflect.get(g, Symbol.for("test"))).toBeUndefined();
  });

  it("group proxy $resolve collects mixed sync and async fields", async () => {
    const s = defineSettings({
      G: t.object({
        X: t.string({ default: "hello" }),
        Y: t.func(async () => "world"),
      }),
    });
    const g = s.G as { $resolve(): Promise<Record<string, unknown>> };
    const result = await g.$resolve();
    expect(result.X).toBe("hello");
    expect(result.Y).toBe("world");
  });
});

describe("sync accessor $versions and $onChange", () => {
  it("$versions returns empty array initially for sync field", () => {
    process.env.X = "1";
    const s = defineSettings({ X: t.string() });
    const acc = s.X as { $versions: string[] };
    expect(acc.$versions).toEqual([]);
  });

  it("$onChange registers and removes listener for sync field", () => {
    process.env.X = "hello";
    const s = defineSettings({ X: t.string() });
    const acc = s.X as { $onChange(cb: (n: unknown, p: unknown) => void): () => void };
    const cb = vi.fn();
    const off = acc.$onChange(cb);
    expect(typeof off).toBe("function");
    off();
  });
});

describe("constant in nested group", () => {
  it("registers raw constant value inside t.object() group", () => {
    const s = defineSettings({
      G: t.object({ X: t.string({ default: "x" }), CONST: "static" as unknown }),
    });
    expect((s.G.X as { $value(): string }).$value()).toBe("x");
  });
});

describe("group proxy ownKeys with unrelated root fields", () => {
  it("ownKeys on group proxy filters out cells from other groups", () => {
    const s = defineSettings({
      G: t.object({ X: t.string({ default: "x" }) }),
      OTHER: t.string({ default: "other" }),
    });
    const g = s.G as Record<string, unknown>;
    expect(Object.keys(g)).toEqual(["X"]);
  });

  it("$value() on group with unrelated root fields returns only group fields", () => {
    const s = defineSettings({
      G: t.object({ X: t.string({ default: "x" }) }),
      OTHER: t.string({ default: "other" }),
    });
    const g = s.G as { $value(): Record<string, unknown> };
    const val = g.$value();
    expect(val.X).toBe("x");
    expect(val.OTHER).toBeUndefined();
  });
});

describe("$mutate with $ prefix key skipping", () => {
  it("$mutate ignores keys starting with $", () => {
    const s = defineSettings({ X: t.string({ default: "original" }) });
    s.$mutate({ $load: "ignored" as unknown, X: "updated" } as Parameters<typeof s.$mutate>[0]);
    expect(s.X.$value()).toBe("updated");
  });
});

describe("group proxy get for nonexistent key returns undefined", () => {
  it("accessing nonexistent child key on group proxy returns undefined", () => {
    process.env.G_X = "1";
    const s = defineSettings({ G: t.object({ X: t.string() }) });
    const g = s.G as Record<string, unknown>;
    expect(g.NONEXISTENT).toBeUndefined();
  });

  it("$value() on group with nested sub-group skips deeper cells", () => {
    const s = defineSettings({
      G: t.object({
        X: t.string({ default: "x" }),
        INNER: t.object({ Y: t.string({ default: "y" }) }),
      }),
    });
    const g = s.G as { $value(): Record<string, unknown> };
    const val = g.$value();
    expect(val.X).toBe("x");
    expect(val.INNER).toBeUndefined();
  });
});

describe("root proxy has trap with reserved keys", () => {
  it("has trap returns true for $mutate, $reset, $load", () => {
    const s = defineSettings({ X: t.string({ default: "x" }) }) as unknown as Record<
      string,
      unknown
    >;
    expect("$mutate" in s).toBe(true);
    expect("$reset" in s).toBe(true);
    expect("$load" in s).toBe(true);
  });

  it("has trap returns false for Symbol prop", () => {
    const s = defineSettings({ X: t.string({ default: "x" }) }) as unknown as Record<
      string,
      unknown
    >;
    expect(Symbol.for("test") in s).toBe(false);
  });
});
