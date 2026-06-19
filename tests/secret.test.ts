import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecretAdapter, SecretValue } from "../src/adapters/types.js";
import {
  defineSettings,
  hasAdapter,
  registerAdapter,
  SettingsValidationError,
  types as t,
} from "../src/index.js";

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
});
afterEach(() => {
  process.env = originalEnv;
});

// ── Mock adapter ───────────────────────────────────────────────────────────────

function createMockAdapter(opts?: {
  fetch?: (name: string) => SecretValue | Promise<SecretValue>;
}): SecretAdapter {
  const store: Record<string, string> = {
    "my/string": "plain-value",
    "my/json": '{"host":"localhost","port":5432}',
  };

  return {
    provider: "mock",
    async fetch(name: string) {
      if (opts?.fetch) return opts.fetch(name);
      const value = store[name];
      if (value === undefined) throw new Error(`Secret not found: ${name}`);
      return { value, versionId: "v1" };
    },
  };
}

const mockAdapter = createMockAdapter();

/** Accessor type for $resolve / $refresh on secret fields. */
type SecretAccessor = {
  $resolve(): Promise<unknown>;
  $refresh(): Promise<unknown>;
  $versions: string[];
  $onChange(cb: (n: unknown, o: unknown) => void): () => void;
};

/** Helper for treating a secret field as a SecretAccessor. */
function asSecret(field: unknown): SecretAccessor {
  return field as SecretAccessor;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("t.Secret with inline adapter", () => {
  it("fetches a plain string secret", async () => {
    process.env.VALUE = "my/string";
    const s = defineSettings({ VALUE: t.secret({ adapter: mockAdapter }) });
    expect(await asSecret(s.VALUE).$resolve()).toBe("plain-value");
  });

  it("auto-parses JSON secret values", async () => {
    process.env.VALUE = "my/json";
    const s = defineSettings({ VALUE: t.secret({ adapter: mockAdapter }) });
    expect(await asSecret(s.VALUE).$resolve()).toEqual({ host: "localhost", port: 5432 });
  });

  it("returns undefined when optional and env var is not set", async () => {
    const s = defineSettings({ VALUE: t.secret({ adapter: mockAdapter, optional: true }) });
    expect(await asSecret(s.VALUE).$resolve()).toBeUndefined();
  });

  it("throws MissingEnvError for required field with no env", async () => {
    const s = defineSettings({ VALUE: t.secret({ adapter: mockAdapter }) });
    await expect(asSecret(s.VALUE).$resolve()).rejects.toThrow();
  });

  it("respects key override", async () => {
    process.env.CUSTOM_NAME = "my/string";
    const s = defineSettings(
      { VALUE: t.secret({ adapter: mockAdapter, key: "CUSTOM_NAME" }) },
      { prefix: "APP_" },
    );
    expect(await asSecret(s.VALUE).$resolve()).toBe("plain-value");
  });

  it("works with constant case conversion", async () => {
    process.env.MY_SECRET = "my/string";
    const s = defineSettings({ mySecret: t.secret({ adapter: mockAdapter }) });
    expect(await asSecret(s.mySecret).$resolve()).toBe("plain-value");
  });
});

describe("t.Secret with registered adapter", () => {
  beforeAll(() => {
    if (!hasAdapter("test-mock")) {
      registerAdapter("test-mock", createMockAdapter());
    }
  });

  it("fetches using adapter name string", async () => {
    process.env.KEY = "my/string";
    const s = defineSettings({ KEY: t.secret({ adapter: "test-mock" }) });
    expect(await asSecret(s.KEY).$resolve()).toBe("plain-value");
  });

  it("throws for unregistered adapter", async () => {
    process.env.KEY = "my/string";
    const s = defineSettings({ KEY: t.secret({ adapter: "non-existent" }) });
    await expect(asSecret(s.KEY).$resolve()).rejects.toThrow(
      'Secret adapter "non-existent" is not registered',
    );
  });
});

describe("Secret accessor $ properties", () => {
  it("exposes $resolve, $refresh, $versions, $onChange", async () => {
    process.env.S = "my/json";
    const s = defineSettings({ S: t.secret({ adapter: mockAdapter }) });
    const acc = asSecret(s.S);
    expect(typeof acc.$resolve).toBe("function");
    expect(typeof acc.$refresh).toBe("function");
    expect(typeof acc.$onChange).toBe("function");
    expect(Array.isArray(acc.$versions)).toBe(true);
  });

  it("seeds $versions after resolution", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({ value: '{"x":1}', versionId: "v2" }),
    });
    process.env.S = "any";
    const s = defineSettings({ S: t.secret({ adapter }) });
    const acc = asSecret(s.S);
    await acc.$resolve();
    expect(acc.$versions).toEqual(["v2"]);
  });

  it("$refresh re-fetches and returns new value", async () => {
    let callCount = 0;
    const adapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
      },
    });
    process.env.S = "any";
    const s = defineSettings({ S: t.secret({ adapter }) });
    const acc = asSecret(s.S);

    expect(await acc.$resolve()).toEqual({ x: 1 });
    expect(callCount).toBe(1);

    const refreshed = (await acc.$refresh()) as Record<string, unknown>;
    expect(callCount).toBe(2);
    expect(refreshed.x).toBe(2);
  });

  it("$onChange callback fires after $refresh", async () => {
    let callCount = 0;
    let capturedNew: unknown;
    let capturedOld: unknown;
    const adapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
      },
    });
    process.env.S = "any";
    const s = defineSettings({ S: t.secret({ adapter }) });
    const acc = asSecret(s.S);

    await acc.$resolve();
    acc.$onChange((n, o) => {
      capturedNew = n;
      capturedOld = o;
    });
    await acc.$refresh();

    expect(capturedNew).toEqual({ x: 2 });
    expect(capturedOld).toEqual({ x: 1 });
  });

  it("$onChange supports multiple callbacks and unsubscribe", async () => {
    let a = 0;
    let b = 0;
    let callCount = 0;
    const adapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
      },
    });
    process.env.MC = "any";
    const s = defineSettings({ MC: t.secret({ adapter }) });
    const acc = asSecret(s.MC);
    await acc.$resolve();

    const unsubB = acc.$onChange(() => {
      b++;
    });
    acc.$onChange(() => {
      a++;
    });

    await acc.$refresh();
    expect(a).toBe(1);
    expect(b).toBe(1);

    unsubB();
    await acc.$refresh();
    expect(a).toBe(2);
    expect(b).toBe(1);
  });
});

describe("Secret: edge cases", () => {
  it("throws for null/undefined adapter", async () => {
    process.env.X = "whatever";
    const s = defineSettings({ X: t.secret({ adapter: null as unknown as string }) });
    await expect(asSecret(s.X).$resolve()).rejects.toThrow("Secret adapter is required");
  });

  it("works with source option instead of process.env", async () => {
    const s = defineSettings(
      { KEY: t.secret({ adapter: mockAdapter }) },
      { source: { KEY: "my/string" } },
    );
    expect(await asSecret(s.KEY).$resolve()).toBe("plain-value");
  });
});

describe("t.Secret with schema option", () => {
  const schemaAdapter = createMockAdapter({
    fetch: async () => ({
      value: '{"HOST":"pg.example.com","PORT":"5432"}',
      versionId: "v1",
    }),
  });

  it("resolves nested TypeDefs against secret JSON", async () => {
    process.env.DB = "my/db";
    const s = defineSettings({
      DB: t.secret({
        adapter: schemaAdapter,
        schema: { HOST: t.string(), PORT: t.number() },
      }),
    });
    expect(await asSecret(s.DB).$resolve()).toEqual({ HOST: "pg.example.com", PORT: 5432 });
  });

  it("works with optional and schema", async () => {
    const s = defineSettings({
      DB: t.secret({
        adapter: schemaAdapter,
        schema: { HOST: t.string() },
        optional: true,
      }),
    });
    expect(await asSecret(s.DB).$resolve()).toBeUndefined();
  });

  it("resolves schema with defaults when env var is not set (no adapter key needed)", async () => {
    const s = defineSettings({
      DB: t.secret({
        adapter: schemaAdapter,
        schema: { HOST: t.string({ default: "localhost" }), PORT: t.number({ default: 3306 }) },
      }),
    });
    expect(await asSecret(s.DB).$resolve()).toEqual({ HOST: "localhost", PORT: 3306 });
  });

  it("throws for schema field with no default when env var is not set", async () => {
    const s = defineSettings({
      DB: t.secret({
        adapter: schemaAdapter,
        schema: { HOST: t.string() },
      }),
    });
    await expect(asSecret(s.DB).$resolve()).rejects.toThrow();
  });
});

describe("Secret TTL caching", () => {
  it("$resolve respects TTL and returns cached value", async () => {
    let callCount = 0;
    const ttlAdapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
      },
    });
    process.env.S = "any";
    const s = defineSettings({
      S: t.secret({ adapter: ttlAdapter, ttl: 60_000 }),
    });
    const acc = asSecret(s.S);

    await acc.$resolve();
    expect(callCount).toBe(1);

    // Within TTL, returns cached value without fetching
    const result = await acc.$resolve();
    expect(callCount).toBe(1);
    expect((result as Record<string, unknown>).x).toBe(1);
  });

  it("$refresh bypasses TTL", async () => {
    let callCount = 0;
    const ttlAdapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
      },
    });
    process.env.S = "any";
    const s = defineSettings({
      S: t.secret({ adapter: ttlAdapter, ttl: 60_000 }),
    });
    const acc = asSecret(s.S);
    await acc.$resolve();
    expect(callCount).toBe(1);

    const result = await acc.$refresh();
    expect(callCount).toBe(2);
    expect((result as Record<string, unknown>).x).toBe(2);
  });

  it("$resolve returns fresh value after TTL expiry", async () => {
    vi.useFakeTimers();
    try {
      let callCount = 0;
      const ttlAdapter: SecretAdapter = {
        provider: "ttl-mock",
        async fetch() {
          callCount++;
          return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
        },
      };
      process.env.S = "any";
      const s = defineSettings({
        S: t.secret({ adapter: ttlAdapter, ttl: 1000 }),
      });
      const acc = asSecret(s.S);

      // Within TTL, does not re-fetch
      const first = await acc.$resolve();
      expect(callCount).toBe(1);
      expect((first as Record<string, unknown>).x).toBe(1);

      // Advance past TTL
      vi.advanceTimersByTime(1001);

      // $resolve() detects TTL expiry, re-fetches, and returns the new value
      const second = await acc.$resolve();
      expect(callCount).toBe(2);
      expect((second as Record<string, unknown>).x).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Secret error handling", () => {
  it("wraps adapter.fetch errors in InvalidValueError", async () => {
    const errorAdapter: SecretAdapter = {
      provider: "error-mock",
      async fetch() {
        throw new Error("Secret not found");
      },
    };
    process.env.S = "my/secret";
    const s = defineSettings({ S: t.secret({ adapter: errorAdapter }) });
    await expect(asSecret(s.S).$resolve()).rejects.toThrow(
      'Secret adapter "error-mock" failed: Secret not found',
    );
  });
});

describe("Secret $refresh with schema", () => {
  it("re-applies schema resolution on $refresh", async () => {
    let callCount = 0;
    const refreshAdapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return {
          value: `{"HOST":"host${callCount}","PORT":"${callCount}0"}`,
          versionId: `v${callCount}`,
        };
      },
    });
    process.env.S = "any";
    const s = defineSettings({
      S: t.secret({
        adapter: refreshAdapter,
        schema: { HOST: t.string(), PORT: t.number() },
      }),
    });
    const acc = asSecret(s.S);

    expect(await acc.$resolve()).toEqual({ HOST: "host1", PORT: 10 });
    expect(callCount).toBe(1);

    const refreshed = await acc.$refresh();
    expect(callCount).toBe(2);
    expect(refreshed).toEqual({ HOST: "host2", PORT: 20 });
  });
});

describe("Secret: changeCase interaction", () => {
  it("changeCase: true converts camelCase key to CONSTANT_CASE", async () => {
    process.env.DB_PASSWORD = "my/string";
    const mockAdpt = createMockAdapter();
    const s = defineSettings({ dbPassword: t.secret({ adapter: mockAdpt }) });
    expect(await asSecret(s.dbPassword).$resolve()).toBe("plain-value");
  });

  it("changeCase: false uses the key as-is", async () => {
    process.env.dbPassword = "my/string";
    const mockAdpt = createMockAdapter();
    const s = defineSettings(
      { dbPassword: t.secret({ adapter: mockAdpt }) },
      { changeCase: false },
    );
    expect(await asSecret(s.dbPassword).$resolve()).toBe("plain-value");
  });

  it("explicit key override is not affected by changeCase", async () => {
    process.env.CUSTOM_KEY = "my/string";
    const mockAdpt = createMockAdapter();
    const s = defineSettings(
      { field: t.secret({ adapter: mockAdpt, key: "CUSTOM_KEY" }) },
      { changeCase: true },
    );
    expect(await asSecret(s.field).$resolve()).toBe("plain-value");
  });
});

describe("Secret type inference", () => {
  it("infers correct type from schema", async () => {
    process.env.DB = "my/db";
    const s = defineSettings({
      DB: t.secret({
        adapter: createMockAdapter({
          fetch: async () => ({ value: '{"HOST":"localhost","PORT":"5432"}', versionId: "v1" }),
        }),
        schema: { HOST: t.string(), PORT: t.number() },
      }),
    });
    expect(await asSecret(s.DB).$resolve()).toEqual({ HOST: "localhost", PORT: 5432 });
  });

  it("infers plain string when no schema", async () => {
    process.env.S = "my/string";
    defineSettings({ S: t.secret({ adapter: createMockAdapter() }) });
  });
});

describe("Secret schema with deferred fields", () => {
  it("resolves template fields inside Secret schema", async () => {
    process.env.S = "any";
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: '{"HOST":"localhost","PORT":"5432"}', versionId: "v1" };
      },
    };
    const s = defineSettings({
      S: t.secret({
        adapter,
        schema: {
          HOST: t.string(),
          PORT: t.number(),
          URL: t.template("http://{HOST}:{PORT}"),
        },
      }),
    });
    const val = (await asSecret(s.S).$resolve()) as {
      HOST: string;
      PORT: number;
      URL: string;
    };
    expect(val.URL).toBe("http://localhost:5432");
  });

  it("resolves async func fields inside Secret schema", async () => {
    process.env.S = "any";
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: '{"HOST":"localhost"}', versionId: "v1" };
      },
    };
    const s = defineSettings({
      S: t.secret({
        adapter,
        schema: {
          HOST: t.string(),
          COMPUTED: t.func(
            async ({ values }) => `async:${(values.HOST as { $value(): string }).$value()}`,
          ),
        },
      }),
    });
    const val = (await asSecret(s.S).$resolve()) as { HOST: string; COMPUTED: string };
    expect(val.HOST).toBe("localhost");
    expect(val.COMPUTED).toBe("async:localhost");
  });
});

describe("secret without versionId", () => {
  it("handles missing versionId on creation", async () => {
    process.env.S = "any";
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: '{"x":1}' };
      },
    };
    const s = defineSettings({ S: t.secret({ adapter }) });
    const acc = asSecret(s.S);
    await acc.$resolve();
    expect(acc.$versions).toEqual([]);
  });

  it("handles missing versionId on refresh", async () => {
    let callCount = 0;
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        callCount++;
        return { value: `{"x":${callCount}}` };
      },
    };
    process.env.S = "any";
    const s = defineSettings({ S: t.secret({ adapter }) });
    const acc = asSecret(s.S);
    await acc.$resolve();
    await acc.$refresh();
    expect(acc.$versions).toEqual([]);
  });
});

describe("getAdapter", () => {
  it("returns undefined for unregistered adapter", async () => {
    const { getAdapter } = await import("../src/secret.js");
    expect(getAdapter("non-existent")).toBeUndefined();
  });

  it("returns registered adapter", async () => {
    const { getAdapter, registerAdapter: register } = await import("../src/secret.js");
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: "test" };
      },
    };
    register("getAdapter-test", adapter);
    expect(getAdapter("getAdapter-test")).toBe(adapter);
  });
});

describe("Secret: array values", () => {
  it("array secret resolves to an array", async () => {
    process.env.S = "any";
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: '["a","b","c"]', versionId: "v1" };
      },
    };
    const s = defineSettings({ S: t.secret({ adapter }) });
    const val = await asSecret(s.S).$resolve();
    expect(Array.isArray(val)).toBe(true);
    expect(val).toEqual(["a", "b", "c"]);
  });
});

describe("resolveFn sub-errors", () => {
  it("throws SettingsValidationError when Secret schema resolution fails", async () => {
    process.env.S = "any";
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: '{"HOST":"localhost","PORT":"not-a-number"}', versionId: "v1" };
      },
    };
    const s = defineSettings({
      S: t.secret({
        adapter,
        schema: { HOST: t.string(), PORT: t.number() },
      }),
    });
    await expect(asSecret(s.S).$resolve()).rejects.toThrow(SettingsValidationError);
  });

  it("handles null fields in Secret JSON", async () => {
    process.env.S = "any";
    const adapter: SecretAdapter = {
      provider: "test",
      async fetch() {
        return { value: '{"HOST":null,"PORT":"5432"}', versionId: "v1" };
      },
    };
    const s = defineSettings({
      S: t.secret({
        adapter,
        schema: { HOST: t.string({ optional: true }), PORT: t.number() },
      }),
    });
    const val = (await asSecret(s.S).$resolve()) as { HOST?: string; PORT: number };
    expect(val.HOST).toBeUndefined();
    expect(val.PORT).toBe(5432);
  });
});

describe("settings-level mutate / reset on secrets", () => {
  it("settings-level reset restores original secret resolution", async () => {
    let callCount = 0;
    const adapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"x":${callCount}}`, versionId: `v${callCount}` };
      },
    });
    process.env.GROUP_A = "any";
    const s = defineSettings({
      GROUP: t.object({
        A: t.secret({ adapter }),
      }),
    });

    const a = asSecret((s.GROUP as unknown as Record<string, unknown>).A);
    expect(await a.$resolve()).toEqual({ x: 1 });
    expect(callCount).toBe(1);

    // Override A via settings-level mutate
    s.$mutate({ GROUP: { A: { x: 999 } } } as never);
    expect(await a.$resolve()).toEqual({ x: 999 });
    expect(callCount).toBe(1); // override short-circuits the fetch

    // After reset, the override is removed and the secret is fetched again.
    // Default TTL is 0, so $resolve after reset re-fetches.
    s.$reset();
    expect(await a.$resolve()).toEqual({ x: 2 });
    expect(callCount).toBe(2);
  });
});
