import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SecretAdapter } from "../src/adapters/types.js";
import {
  defineSettings,
  InvalidValueError,
  MissingEnvError,
  registerAdapter,
  SchemaDefinitionError,
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

// ── Mock secret adapter ───────────────────────────────────────────────────────

function createMockAdapter(opts?: {
  store?: Record<string, string>;
  fetch?: (
    name: string,
  ) => { value: string; versionId?: string } | Promise<{ value: string; versionId?: string }>;
}): SecretAdapter {
  const store: Record<string, string> = opts?.store ?? {
    "db/secret": '{"host":"pg.example.com","port":"5432","user":"app"}',
    "api/key": "sk-abc123",
    "config/cache": '{"enabled":true,"ttl":"5m"}',
  };
  return {
    provider: "mock",
    async fetch(name: string) {
      if (opts?.fetch) return opts.fetch(name);
      const value = store[name];
      if (value === undefined) throw new Error(`Not found: ${name}`);
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

// ==============================================================================
// 1. Deferred dependency chains with mutation
// ==============================================================================

describe("Deferred dependency chains", () => {
  it("Template referencing a template (deferred→deferred) survives settings-level mutate and reset", async () => {
    process.env.APP_NAME = "myapp";
    process.env.APP_PORT = "3000";
    const s = defineSettings(
      {
        name: t.string(),
        url: t.template("http://{name}:{port}"),
        port: t.number(),
      },
      { prefix: "APP_" },
    );
    await s.$load();

    expect(await s.url.$resolve()).toBe("http://myapp:3000");

    // mutate the dependency -> template should be re-evaluated
    s.$mutate({ name: "staging", port: 8080 });
    expect(await s.url.$resolve()).toBe("http://staging:8080");

    // reset -> template should restore original value
    s.$reset();
    expect(await s.url.$resolve()).toBe("http://myapp:3000");
  });

  it("Func referencing a template in a nested group", async () => {
    // Func must be defined BEFORE the template it depends on
    // (deferred entries resolve in reverse definition order)
    process.env.APP_MSG = "Hello";
    const s = defineSettings(
      {
        display: t.func(async ({ values }) => {
          const greeting = await values.greeting.$resolve();
          return greeting != null ? `${greeting} — length: ${String(greeting).length}` : "pending";
        }),
        msg: t.string(),
        target: t.string({ default: "World" }),
        greeting: t.template("{msg}, {target}!"),
      },
      { prefix: "APP_" },
    );
    await s.$load();

    expect(await s.display.$resolve()).toBe("Hello, World! — length: 13");
  });

  it("Template referencing a Func that depends on another type", async () => {
    process.env.APP_BASE = "10";
    const s = defineSettings(
      {
        base: t.number(),
        doubled: t.func(({ values }) => (values.base.$value() as number) * 2),
        report: t.template("base={base}, doubled={doubled}"),
      },
      { prefix: "APP_" },
    );
    await s.$load();

    expect(await s.report.$resolve()).toBe("base=10, doubled=20");
  });

  it("Template re-evaluates after settings-level mutate changes dependency, reset restores", async () => {
    process.env.APP_LANG = "ja";
    const s = defineSettings(
      {
        lang: t.string(),
        greeting: t.template("Hello, {name}! Lang={lang}"),
        name: t.string({ default: "Guest" }),
      },
      { prefix: "APP_" },
    );
    await s.$load();

    expect(await s.greeting.$resolve()).toBe("Hello, Guest! Lang=ja");

    // mutate multiple dependencies
    s.$mutate({ name: "Admin", lang: "en" });
    expect(await s.greeting.$resolve()).toBe("Hello, Admin! Lang=en");

    // reset restores all
    s.$reset();
    expect(await s.greeting.$resolve()).toBe("Hello, Guest! Lang=ja");
  });

  it("Chained deferred with Func→Template→Template→constant", async () => {
    // Func must be defined BEFORE the templates it depends on
    // (deferred entries resolve in reverse definition order)
    process.env.VAL = "42";
    const s = defineSettings(
      {
        COMPUTED: t.func(async ({ values }) => {
          const outer = await values.OUTER.$resolve();
          return outer != null ? `result: ${outer}` : "pending";
        }),
        VAL: t.number(),
        OUTER: t.template("outer({INNER})"),
        INNER: t.template("inner({VAL})"),
      },
      { prefix: "" },
    );
    await s.$load();

    expect(await s.INNER.$resolve()).toBe("inner(42)");
    expect(await s.OUTER.$resolve()).toBe("outer(inner(42))");
    expect(await s.COMPUTED.$resolve()).toBe("result: outer(inner(42))");
  });

  it("Deeply nested group: Func accesses sibling and parent values", async () => {
    process.env.APP_DB_NAME = "mydb";
    process.env.APP_DB_POOL = "10";
    process.env.APP_ENV = "production";
    const s = defineSettings(
      {
        env: t.string(),
        db: t.object({
          name: t.string(),
          pool: t.number(),
          url: t.template("postgres://{db.name}?pool={db.pool}"),
          check: t.func(({ values }) => {
            const db = values.db as unknown as Record<string, { $value(): unknown }>;
            return `env=${values.env.$value()}, db=${db.name.$value()}, pool=${db.pool.$value()}`;
          }),
        }),
      },
      { prefix: "APP_" },
    );
    await s.$load();

    expect(await s.db.url.$resolve()).toBe("postgres://mydb?pool=10");
    expect(s.db.check.$value()).toBe("env=production, db=mydb, pool=10");
  });
});

// ==============================================================================
// 2. Secret lifecycle with settings operations
// ==============================================================================

describe("Secret lifecycle with settings operations", () => {
  it("Secret with schema: mutate then reset then $refresh", async () => {
    let callCount = 0;
    const adapter = createMockAdapter({
      fetch: async (_name) => {
        callCount++;
        return {
          value: `{"host":"host${callCount}","port":"${callCount}0"}`,
          versionId: `v${callCount}`,
        };
      },
    });

    process.env.SEC = "db/secret";
    const s = defineSettings({
      sec: t.secret({
        adapter,
        key: "SEC",
        schema: { host: t.string(), port: t.number() },
      }),
    });
    const sec = asSecret(s.sec);

    expect(await sec.$resolve()).toEqual({ host: "host1", port: 10 });
    expect(callCount).toBe(1);

    // settings-level mutate overrides the secret value
    s.$mutate({ sec: { host: "overridden", port: 9999 } } as never);
    expect(await sec.$resolve()).toEqual({ host: "overridden", port: 9999 });

    // reset restores the original secret value (ttl=0 → re-fetch)
    s.$reset();
    const after = await sec.$resolve();
    expect(after).toEqual({ host: `host${callCount}`, port: callCount * 10 });

    // $refresh on the secret accessor re-fetches
    const refreshed = await sec.$refresh();
    expect(refreshed).toEqual({ host: `host${callCount}`, port: callCount * 10 });
  });
});

// ==============================================================================
// 3. Mixed error aggregation
// ==============================================================================

describe("Mixed error aggregation", () => {
  it("Missing, invalid value, and schema errors aggregated in one call", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings(
      {
        MISSING: t.string(),
        BAD_INT: t.number(),
        BAD_OPTION: t.string({ options: ["a", "b"] }),
      },
      { source: { BAD_INT: "not-a-number", BAD_OPTION: "invalid-option" } },
    );
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }

    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(3);
    const kinds = caught?.errors.map((e) => e.constructor.name).sort();
    expect(kinds).toEqual(["InvalidValueError", "InvalidValueError", "MissingEnvError"]);
  });

  it("Errors in nested groups aggregated with top-level errors", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({
      TOP: t.string(),
      DATABASE: t.object({
        HOST: t.string({ key: "DB_HOST" }),
        PORT: t.number({ key: "BAD_PORT" }),
      }),
    });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(3);
    expect(caught?.errors[0]).toBeInstanceOf(MissingEnvError);
  });

  it("Template + Func + type errors all aggregated", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({
      URL: t.template("{MISSING_HOST}"),
      PORT: t.number({ default: 8080 }),
      COMPUTED: t.func(() => {
        throw InvalidValueError.forField("COMPUTED", "computation failed");
      }),
    });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(2);
    const kinds = caught?.errors.map((e) => e.constructor.name).sort();
    expect(kinds).toEqual(["InvalidValueError", "SchemaDefinitionError"]);
  });

  it("Secret adapter error aggregated with other validation errors", async () => {
    const errorAdapter: SecretAdapter = {
      provider: "err-mock",
      async fetch() {
        throw new Error("Connection refused");
      },
    };

    let caught: SettingsValidationError | undefined;
    process.env.SEC_REF = "my/secret";
    const s = defineSettings({
      SEC_REF: t.secret({ adapter: errorAdapter }),
      MISSING: t.string(),
    });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(2);
    const sortedErrors = caught?.errors
      .slice()
      .sort((a, b) => a.constructor.name.localeCompare(b.constructor.name));
    expect(sortedErrors?.[0]).toBeInstanceOf(InvalidValueError);
    expect(sortedErrors?.[0].message).toContain("Connection refused");
    expect(sortedErrors?.[1]).toBeInstanceOf(MissingEnvError);
  });

  it("Non-existent template reference and missing env vars aggregated", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({
      URL: t.template("http://{HOST}:{PORT}"),
      PORT: t.number({ default: 8080 }),
    });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(1);
    expect(caught?.errors[0]).toBeInstanceOf(SchemaDefinitionError);
    expect(caught?.errors[0].message).toContain("HOST");
  });
});

// ==============================================================================
// 4. Complex type compositions
// ==============================================================================

describe("Complex type compositions", () => {
  it("All basic types together from env source (changeCase: false)", async () => {
    const s = defineSettings(
      {
        name: t.string({ default: "app" }),
        port: t.number({ default: 8080 }),
        enabled: t.boolean({ default: true }),
        tags: t.array({ type: t.string(), delimiter: "," }),
        endpoint: t.url(),
        timeout: t.duration(),
      },
      {
        source: {
          name: "production",
          port: "443",
          enabled: "false",
          tags: "web,api,admin",
          endpoint: "https://example.com/api",
          timeout: "30s",
        },
        changeCase: false,
      },
    );
    await s.$load();

    expect(await s.name.$value()).toBe("production");
    expect(await s.port.$value()).toBe(443);
    expect(await s.enabled.$value()).toBe(false);
    expect(await s.tags.$value()).toEqual(["web", "api", "admin"]);
    expect(await s.endpoint.$value()).toBeInstanceOf(URL);
    expect(((await s.endpoint.$value()) as URL).href).toBe("https://example.com/api");
    expect(await s.timeout.$value()).toBe(30000);
  });
});

// ==============================================================================
// 5. Source + prefix + changeCase combinations
// ==============================================================================

describe("Source + prefix + changeCase combinations", () => {
  it("maskSecrets hides raw values for SECRET-pattern fields", async () => {
    let caught: SettingsValidationError | undefined;
    const s1 = defineSettings(
      { apiKey: t.string({ regex: /^[a-z]+$/ }) },
      { source: { API_KEY: "super-secret-value!" }, maskSecrets: true },
    );
    try {
      await s1.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors[0].message).not.toContain("super-secret-value!");
  });

  it("maskSecrets: false exposes raw values in error messages", async () => {
    let caught: SettingsValidationError | undefined;
    const s2 = defineSettings(
      { apiKey: t.string({ regex: /^[a-z]+$/ }) },
      { source: { API_KEY: "super-secret-value!" }, maskSecrets: false },
    );
    try {
      await s2.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors[0].message).toContain("super-secret-value!");
  });
});

// ==============================================================================
// 6. Real-world scenarios
// ==============================================================================

describe("Real-world scenarios", () => {
  it("Web service: DB secret + computed URLs + feature flags + mutate/reset", async () => {
    const adapter = createMockAdapter({
      store: { "prod/db": JSON.stringify({ host: "pg.example.com", port: "5432", user: "app" }) },
    });

    const s = defineSettings(
      {
        SERVER_PORT: t.number({ default: 3000 }),
        SERVER_ENV: t.string({ default: "development" }),
        DATABASE: t.secret({
          adapter,
          key: "DB_REF",
          // schema keys must match the JSON keys returned by the adapter
          schema: {
            host: t.string(),
            port: t.number(),
            user: t.string(),
            url: t.template("postgres://{user}@{host}:{port}/app"),
          },
        }),
        FEATURE_X: t.boolean({ trueValues: ["yes", "true", "1"] }),
        API_VERSION: t.string({ default: "v2" }),
        // fullUrl (Func) must be defined BEFORE apiEndpoint (template)
        // because deferred entries resolve in reverse definition order
        FULL_URL: t.func(async ({ values }) => {
          const db = (await asSecret(values.DATABASE).$resolve()) as { url: string };
          return `db=${db.url}, featureX=${values.FEATURE_X.$value()}, apiVersion=${values.API_VERSION.$value()}`;
        }),
        API_ENDPOINT: t.template("https://api.example.com/{API_VERSION}"),
      },
      {
        source: {
          SERVER_PORT: "4000",
          FEATURE_X: "true",
          DB_REF: "prod/db",
        },
      },
    );

    // Verify all values
    expect(s.SERVER_PORT.$value()).toBe(4000);
    expect(s.SERVER_ENV.$value()).toBe("development");
    const db = (await asSecret(s.DATABASE).$resolve()) as { url: string };
    expect(db.url).toBe("postgres://app@pg.example.com:5432/app");
    expect(s.FEATURE_X.$value()).toBe(true);
    expect(await s.API_ENDPOINT.$resolve()).toBe("https://api.example.com/v2");
    // async func returns AsyncAccessor, so resolve via $resolve()
    expect(await asSecret(s.FULL_URL).$resolve()).toBe(
      "db=postgres://app@pg.example.com:5432/app, featureX=true, apiVersion=v2",
    );

    // Development override: mutate port + feature flag
    s.$mutate({
      SERVER_PORT: 3000,
      FEATURE_X: false,
    });
    expect(s.SERVER_PORT.$value()).toBe(3000);
    expect(s.FEATURE_X.$value()).toBe(false);
    // Un-mutated template still correct
    expect(await s.API_ENDPOINT.$resolve()).toBe("https://api.example.com/v2");

    // Reset restores original
    s.$reset();
    expect(s.SERVER_PORT.$value()).toBe(4000);
    expect(s.FEATURE_X.$value()).toBe(true);
  });

  it("Microservice: multiple secret schemas + templates + overrides", async () => {
    const dbAdapter = createMockAdapter({
      store: { "micro/db": JSON.stringify({ host: "db.internal", port: "5432" }) },
    });
    const redisAdapter = createMockAdapter({
      store: { "micro/redis": JSON.stringify({ host: "redis.internal", port: "6379", db: "0" }) },
    });

    const s = defineSettings(
      {
        // schema keys must match the JSON keys returned by each adapter
        DATABASE: t.secret({
          adapter: dbAdapter,
          key: "DB_REF",
          schema: { host: t.string(), port: t.number() },
        }),
        CACHE: t.secret({
          adapter: redisAdapter,
          key: "REDIS_REF",
          schema: { host: t.string(), port: t.number(), db: t.number() },
        }),
        LOG_LEVEL: t.string({ options: ["debug", "info", "warn", "error"], default: "info" }),
        SERVICE_NAME: t.string({ default: "microservice" }),
      },
      {
        source: { DB_REF: "micro/db", REDIS_REF: "micro/redis", LOG_LEVEL: "info" },
      },
    );

    const dbVal = (await asSecret(s.DATABASE).$resolve()) as { host: string };
    const cacheVal = (await asSecret(s.CACHE).$resolve()) as { host: string; db: number };
    expect(dbVal.host).toBe("db.internal");
    expect(cacheVal.host).toBe("redis.internal");
    expect(cacheVal.db).toBe(0);
    expect(s.LOG_LEVEL.$value()).toBe("info");
    expect(s.SERVICE_NAME.$value()).toBe("microservice");

    // Override for local development
    s.$mutate({
      DATABASE: { host: "localhost", port: 5432 },
      CACHE: { host: "localhost", port: 6379, db: 0 },
      LOG_LEVEL: "debug",
    } as never);
    expect(((await asSecret(s.DATABASE).$resolve()) as { host: string }).host).toBe("localhost");
    expect(s.LOG_LEVEL.$value()).toBe("debug");

    // Reset back
    s.$reset();
    expect(((await asSecret(s.DATABASE).$resolve()) as { host: string }).host).toBe("db.internal");
    expect(s.LOG_LEVEL.$value()).toBe("info");
  });

  it("Secrets with optional in dev environment, real fetch in prod", async () => {
    // Simulate dev: no env vars set, optional secrets return undefined
    const dev = defineSettings(
      {
        DB: t.secret({
          adapter: mockAdapter,
          schema: { host: t.string(), port: t.number() },
          optional: true,
        }),
        API_KEY: t.secret({ adapter: mockAdapter, optional: true }),
      },
      { source: {} },
    );

    expect(await asSecret(dev.DB).$resolve()).toBeUndefined();
    expect(await asSecret(dev.API_KEY).$resolve()).toBeUndefined();

    // Simulate prod: env vars point to real secrets
    const prod = defineSettings(
      {
        DB: t.secret({
          adapter: mockAdapter,
          key: "PROD_DB",
          schema: { host: t.string(), port: t.number() },
        }),
        API_KEY: t.secret({
          adapter: mockAdapter,
          key: "PROD_KEY",
        }),
      },
      { source: { PROD_DB: "db/secret", PROD_KEY: "api/key" } },
    );

    const prodDb = (await asSecret(prod.DB).$resolve()) as { host: string; port: number };
    expect(prodDb.host).toBe("pg.example.com");
    expect(prodDb.port).toBe(5432);
    expect(await asSecret(prod.API_KEY).$resolve()).toBe("sk-abc123");
  });
});

// ==============================================================================
// 7. Frozen settings with various features
// ==============================================================================

describe("Frozen settings with various features", () => {
  it("Frozen + secrets + template + func all work for reading", async () => {
    const s = defineSettings(
      {
        name: t.string({ default: "myapp" }),
        port: t.number({ default: 8080 }),
        url: t.template("http://{name}:{port}"),
        desc: t.func(({ values }) => {
          return `${values.name.$value()} on port ${values.port.$value()}`;
        }),
      },
      { frozen: true, changeCase: false },
    );
    await s.$load();

    expect(await s.name.$value()).toBe("myapp");
    expect(await s.port.$value()).toBe(8080);
    expect(await s.url.$resolve()).toBe("http://myapp:8080");
    expect(s.desc.$value()).toBe("myapp on port 8080");
  });

  it("Frozen rejects mutate and reset", async () => {
    const s = defineSettings(
      { val: t.string({ default: "original" }) },
      { frozen: true, changeCase: false },
    );
    await s.$load();

    expect(() => s.$mutate({ val: "changed" })).toThrow("Settings are frozen");
    expect(() => s.$reset()).toThrow("Settings are frozen");
    expect(await s.val.$value()).toBe("original"); // value unchanged
  });

  it("Frozen + secret schema + $refresh works directly on the accessor", async () => {
    let callCount = 0;
    const adapter = createMockAdapter({
      fetch: async () => {
        callCount++;
        return { value: `{"port":${callCount}}`, versionId: `v${callCount}` };
      },
    });

    process.env.S = "any";
    const s = defineSettings({ S: t.secret({ adapter, key: "S" }) }, { frozen: true });
    // Even with frozen: true, $resolve / $refresh on the secret accessor can be called
    const sec = asSecret(s.S);

    expect(await sec.$resolve()).toEqual({ port: 1 });
    await sec.$refresh();
    expect(await sec.$resolve()).toEqual({ port: 2 });
    expect(callCount).toBe(2);
  });
});

// ==============================================================================
// 8. Edge cases in feature interactions
// ==============================================================================

describe("Edge cases in feature interactions", () => {
  it("empty string in source results in empty string (changeCase: false)", async () => {
    const s = defineSettings(
      { val: t.string({ default: "default" }) },
      { source: { val: "" }, changeCase: false },
    );
    await s.$load();
    expect(await s.val.$value()).toBe("");
  });

  it("empty string in source with changeCase: true (key is VAL)", async () => {
    const s = defineSettings({ val: t.string({ default: "default" }) }, { source: { VAL: "" } });
    await s.$load();
    expect(await s.val.$value()).toBe("");
  });

  it("constant type works alongside template and func", async () => {
    const s = defineSettings(
      {
        LIMIT: t.constant(100),
        OFFSET: t.constant(0),
        desc: t.template("LIMIT={LIMIT}, OFFSET={OFFSET}"),
        check: t.func(({ values }) => `range: 0-${values.LIMIT.$value()}`),
      },
      { source: {} },
    );
    await s.$load();

    expect(await s.LIMIT.$value()).toBe(100);
    expect(await s.OFFSET.$value()).toBe(0);
    expect(await s.desc.$resolve()).toBe("LIMIT=100, OFFSET=0");
    expect(await s.check.$value()).toBe("range: 0-100");
  });

  it("settings-level mutate preserves unmentioned sibling fields", async () => {
    const s = defineSettings(
      {
        HOST: t.string({ default: "localhost" }),
        PORT: t.number({ default: 5432 }),
        USER: t.string({ default: "admin" }),
      },
      { source: {} },
    );
    await s.$load();

    s.$mutate({ PORT: 8080 });
    expect(await s.HOST.$value()).toBe("localhost");
    expect(await s.PORT.$value()).toBe(8080);
    expect(await s.USER.$value()).toBe("admin");

    s.$reset();
    expect(await s.PORT.$value()).toBe(5432);
  });

  it("Optional field with no env and no default returns undefined across types", async () => {
    const s = defineSettings(
      {
        s: t.string({ optional: true }),
        n: t.number({ optional: true }),
        b: t.boolean({ optional: true }),
        j: t.json({ optional: true }),
      },
      { source: {}, changeCase: false },
    );
    await s.$load();

    expect(await s.s.$value()).toBeUndefined();
    expect(await s.n.$value()).toBeUndefined();
    expect(await s.b.$value()).toBeUndefined();
    expect(await s.j.$value()).toBeUndefined();
  });

  it("Func inside group accesses values from sibling groups", async () => {
    const s = defineSettings(
      {
        A: t.object({
          X: t.number({ default: 10 }),
        }),
        B: t.object({
          Y: t.number({ default: 20 }),
        }),
        SUM: t.func(({ values }) => {
          const a = values.A as unknown as Record<string, { $value(): unknown }>;
          const b = values.B as unknown as Record<string, { $value(): unknown }>;
          return (a.X.$value() as number) + (b.Y.$value() as number);
        }),
      },
      { source: {} },
    );
    await s.$load();

    expect(await s.SUM.$value()).toBe(30);
  });

  it("Registered adapter with multiple env keys pointing to same secret", async () => {
    const existing = (await import("../src/secret.js")).getAdapter("integration-test");
    if (!existing) {
      registerAdapter(
        "integration-test",
        createMockAdapter({
          store: { "shared/val": "shared-value" },
        }),
      );
    }

    const s = defineSettings(
      {
        A: t.secret({ adapter: "integration-test" }),
        B: t.secret({ adapter: "integration-test" }),
      },
      { source: { A: "shared/val", B: "shared/val" } },
    );
    await s.$load();

    expect(await asSecret(s.A).$resolve()).toBe("shared-value");
    expect(await asSecret(s.B).$resolve()).toBe("shared-value");
  });

  it("can access sync/async/template/object types in the values context of t.func()", async () => {
    const s = defineSettings(
      {
        display: t.func(async ({ values }) => {
          const msg = values.msg.$value();
          const target = values.target.$value();
          const greeting = await values.greeting.$resolve();
          const asyncResult = await values.asyncFunc.$resolve();
          const nested = values.object.nested.$value();
          return `${msg}, ${target}! ${greeting}, ${asyncResult}, ${nested}`;
        }),
        msg: t.string(),
        target: t.string({ default: "World" }),
        greeting: t.template("{msg}, {target}!"),
        asyncFunc: t.func(async () => "Async Func"),
        object: t.object({
          nested: t.string({ default: "nested-value" }),
        }),
      },
      { source: { MSG: "Hello" } },
    );
    await s.$load();
    expect(await s.display.$resolve()).toBe(
      "Hello, World! Hello, World!, Async Func, nested-value",
    );
  });
});

// ==============================================================================
// template mutate/reset and re-evaluation
// ==============================================================================

describe("re-evaluation of template after mutate", () => {
  it("templates inside nested groups are correctly re-evaluated after mutate/reset", async () => {
    const s = defineSettings({
      db: t.object({
        host: t.string({ default: "localhost" }),
        port: t.number({ default: 5432 }),
        url: t.template("postgres://{db.host}:{db.port}/mydb"),
      }),
    });
    await s.$load();

    expect(await s.db.url.$resolve()).toBe("postgres://localhost:5432/mydb");

    s.$mutate({ db: { host: "remotehost", port: 9999 } });
    expect(s.db.host.$value()).toBe("remotehost");
    expect(s.db.port.$value()).toBe(9999);
    expect(await s.db.url.$resolve()).toBe("postgres://remotehost:9999/mydb");

    s.$reset();
    expect(await s.db.url.$resolve()).toBe("postgres://localhost:5432/mydb");
  });
});

// ==============================================================================
// 10. Nested structures (composite patterns of t.object / t.secret)
// ==============================================================================

describe("nested t.object()", () => {
  it("can access child fields of a 2-level nested object via $value()", () => {
    const s = defineSettings(
      {
        app: t.object({
          server: t.object({ host: t.string(), port: t.number() }),
          db: t.object({ url: t.string({ default: "postgres://localhost/app" }) }),
        }),
      },
      { source: { APP_SERVER_HOST: "localhost", APP_SERVER_PORT: "8080" } },
    );
    expect(s.app.server.host.$value()).toBe("localhost");
    expect(s.app.server.port.$value()).toBe(8080);
    expect(s.app.db.url.$value()).toBe("postgres://localhost/app");
  });

  it("can access child fields of a 3-level nested object via $value()", () => {
    const s = defineSettings(
      {
        cloud: t.object({
          aws: t.object({
            rds: t.object({ host: t.string(), port: t.number({ default: 5432 }) }),
          }),
        }),
      },
      { source: { CLOUD_AWS_RDS_HOST: "rds.us-east-1.amazonaws.com" } },
    );
    expect(s.cloud.aws.rds.host.$value()).toBe("rds.us-east-1.amazonaws.com");
    expect(s.cloud.aws.rds.port.$value()).toBe(5432);
  });

  it("mutate/reset works correctly in a 3-level nested structure", () => {
    const s = defineSettings(
      {
        cloud: t.object({
          aws: t.object({
            rds: t.object({ host: t.string({ default: "localhost" }) }),
          }),
        }),
      },
      { source: {} },
    );
    expect(s.cloud.aws.rds.host.$value()).toBe("localhost");
    s.$mutate({ cloud: { aws: { rds: { host: "override.example.com" } } } });
    expect(s.cloud.aws.rds.host.$value()).toBe("override.example.com");
    s.$reset();
    expect(s.cloud.aws.rds.host.$value()).toBe("localhost");
  });

  it("t.template() can reference child fields across multiple levels", async () => {
    const s = defineSettings(
      {
        app: t.object({
          server: t.object({
            host: t.string({ default: "localhost" }),
            port: t.number({ default: 8080 }),
          }),
          url: t.template("http://{app.server.host}:{app.server.port}"),
        }),
      },
      { source: {} },
    );
    expect(await s.app.url.$resolve()).toBe("http://localhost:8080");
  });

  it("t.template() inside a 3-level nested group can reference fields within the same group", async () => {
    const s = defineSettings(
      {
        cloud: t.object({
          aws: t.object({
            rds: t.object({
              host: t.string(),
              port: t.number({ default: 5432 }),
              url: t.template("postgres://{host}:{port}/app"),
            }),
          }),
        }),
      },
      { source: { CLOUD_AWS_RDS_HOST: "rds.example.com" } },
    );
    expect(await s.cloud.aws.rds.url.$resolve()).toBe("postgres://rds.example.com:5432/app");
  });

  it("t.func() can access child fields across multiple levels via values", () => {
    const s = defineSettings(
      {
        app: t.object({
          server: t.object({
            host: t.string({ default: "localhost" }),
            port: t.number({ default: 8080 }),
          }),
          url: t.func(({ values }) => {
            const server = values.app.server;
            return `http://${server.host.$value()}:${server.port.$value()}`;
          }),
        }),
      },
      { source: {} },
    );
    expect(s.app.url.$value()).toBe("http://localhost:8080");
  });
});

describe("combination of t.secret() and nested structures", () => {
  it("child accessors of t.secret({ schema }) are accessible via $resolve()", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ host: "localhost", port: "3306" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      { db: t.secret({ adapter, schema: { host: t.string(), port: t.number() } }) },
      { source: { DB: "any" } },
    );
    expect(s.db.host).toBeDefined();
    expect(s.db.port).toBeDefined();
    expect(await s.db.host.$resolve()).toBe("localhost");
    expect(await s.db.port.$resolve()).toBe(3306);
  });

  it("can access child elements of a flat schema in t.secret({ schema })", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ host: "pg.example.com", port: "5432", name: "appdb" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        config: t.secret({
          adapter,
          schema: { host: t.string(), port: t.number(), name: t.string() },
        }),
      },
      { source: { CONFIG: "any" } },
    );
    expect(await s.config.host.$resolve()).toBe("pg.example.com");
    expect(await s.config.port.$resolve()).toBe(5432);
    expect(await s.config.name.$resolve()).toBe("appdb");
  });

  it("can access child elements when t.secret({ schema }) is specified as a child of t.object()", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ host: "pg.example.com", port: "5432" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        infra: t.object({
          db: t.secret({ adapter, schema: { host: t.string(), port: t.number() } }),
          region: t.string({ default: "ap-northeast-1" }),
        }),
      },
      { source: { INFRA_DB: "db/secret" } },
    );
    expect(s.infra.region.$value()).toBe("ap-northeast-1");
    expect(await s.infra.db.$resolve()).toEqual({ host: "pg.example.com", port: 5432 });
    expect(await s.infra.db.host.$resolve()).toBe("pg.example.com");
    expect(await s.infra.db.port.$resolve()).toBe(5432);
  });

  it("can override t.secret() inside t.object() with env variables", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ host: "pg.example.com", port: "5432" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        infra: t.object({
          db: t.secret({ adapter, schema: { host: t.string(), port: t.number() } }),
          region: t.string({ default: "ap-northeast-1" }),
        }),
      },
      { source: { INFRA_DB: "db/secret", INFRA_DB_HOST: "localhost" } },
    );
    expect(await s.infra.db.$resolve()).toEqual({ host: "localhost", port: 5432 });
    expect(await s.infra.db.host.$resolve()).toBe("localhost");
    expect(await s.infra.db.port.$resolve()).toBe(5432);
  });

  it("env override for t.secret() inside a 3-level nested structure uses the correct prefix", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ user: "original_user", password: "original_pass" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        app: t.object({
          db: t.object({
            credentials: t.secret({ adapter, schema: { user: t.string(), password: t.string() } }),
          }),
        }),
      },
      { source: { APP_DB_CREDENTIALS: "db/creds", APP_DB_CREDENTIALS_USER: "override_user" } },
    );
    const creds = (await s.app.db.credentials.$resolve()) as { user: string; password: string };
    expect(creds.user).toBe("override_user");
    expect(creds.password).toBe("original_pass");
  });

  it("env override values are preserved after $refresh", async () => {
    let fetchCount = 0;
    const adapter = createMockAdapter({
      fetch: async () => {
        fetchCount++;
        return {
          value: JSON.stringify({ host: "pg.example.com", port: "5432" }),
          versionId: `v${fetchCount}`,
        };
      },
    });
    const s = defineSettings(
      { db: t.secret({ adapter, schema: { host: t.string(), port: t.number() }, ttl: 100 }) },
      { source: { DB: "db/secret", DB_HOST: "localhost" } },
    );
    const first = (await s.db.$resolve()) as { host: string; port: number };
    expect(first.host).toBe("localhost");
    expect(fetchCount).toBe(1);
    await s.db.$refresh();
    const second = (await s.db.$resolve()) as { host: string; port: number };
    expect(second.host).toBe("localhost");
    expect(fetchCount).toBe(2);
  });

  it("t.func() can access the resolved value of t.secret() via values", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ host: "pg.secret.com", port: "5432" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        db: t.secret({ adapter, schema: { host: t.string(), port: t.number() } }),
        dbUrl: t.func(async ({ values }) => {
          const db = (await values.db.$resolve()) as { host: string; port: number };
          return `postgres://${db.host}:${db.port}/app`;
        }),
      },
      { source: { DB: "db/secret" } },
    );
    expect(await s.dbUrl.$resolve()).toBe("postgres://pg.secret.com:5432/app");
  });

  it("t.func() can access child fields of t.secret() inside t.object() via values", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ password: "s3cr3t" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        infra: t.object({
          db: t.secret({ adapter, schema: { password: t.string() } }),
        }),
        summary: t.func(async ({ values }) => {
          const pw = (await values.infra.db.password.$resolve()) as string;
          return `password length: ${pw.length}`;
        }),
      },
      { source: { INFRA_DB: "db/secret" } },
    );
    expect(await s.summary.$resolve()).toBe("password length: 6");
  });

  it("when t.secret({ schema }) contains t.func(), sibling fields can be referenced", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ host: "pg.example.com", port: "5432" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        db: t.secret({
          adapter,
          schema: {
            host: t.string(),
            port: t.number(),
            url: t.func(({ values }) => {
              const host = values.host.$value();
              const port = values.port.$value();
              return `postgres://${host}:${port}/app`;
            }),
          },
        }),
      },
      { source: { DB: "db/secret" } },
    );
    const resolved = await s.db.$resolve();
    expect(resolved.host).toBe("pg.example.com");
    expect(resolved.url).toBe("postgres://pg.example.com:5432/app");
  });

  it("t.template() can resolve via $resolve() when the referenced field is t.secret()", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({ value: "sk-abc123", versionId: "v1" }),
    });
    const s = defineSettings(
      {
        api: t.object({
          key: t.secret({ adapter }),
          endpoint: t.string({ default: "https://api.example.com" }),
        }),
        summary: t.template("endpoint={api.endpoint} key={api.key}"),
      },
      { source: { API_KEY: "secret/api-key" } },
    );
    expect(await s.summary.$resolve()).toBe("endpoint=https://api.example.com key=sk-abc123");
  });

  it("multiple t.secret() instances share the same adapter and are cached independently", async () => {
    const fetchLog: string[] = [];
    const adapter = createMockAdapter({
      fetch: async (name) => {
        fetchLog.push(name);
        if (name === "db/secret") return { value: '{"host":"db.example.com"}', versionId: "v1" };
        if (name === "cache/secret")
          return { value: '{"host":"cache.example.com"}', versionId: "v1" };
        throw new Error(`Unknown: ${name}`);
      },
    });
    const s = defineSettings(
      {
        db: t.secret({ adapter, schema: { host: t.string() } }),
        cache: t.secret({ adapter, schema: { host: t.string() } }),
      },
      { source: { DB: "db/secret", CACHE: "cache/secret" } },
    );
    const db = (await s.db.$resolve()) as { host: string };
    const cache = (await s.cache.$resolve()) as { host: string };
    expect(db.host).toBe("db.example.com");
    expect(cache.host).toBe("cache.example.com");
    expect(fetchLog).toEqual(["db/secret", "cache/secret"]);
    await s.db.$resolve();
    await s.cache.$resolve();
    expect(fetchLog).toHaveLength(2);
  });

  it("correctly resolves a complex schema where t.secret() and regular fields are mixed", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({
        value: JSON.stringify({ user: "app_user", password: "s3cr3t" }),
        versionId: "v1",
      }),
    });
    const s = defineSettings(
      {
        app: t.object({
          name: t.string({ default: "myapp" }),
          db: t.object({
            host: t.string({ default: "localhost" }),
            port: t.number({ default: 5432 }),
            credentials: t.secret({ adapter, schema: { user: t.string(), password: t.string() } }),
          }),
          feature: t.object({ enabled: t.boolean({ default: false }) }),
        }),
      },
      { source: { APP_DB_CREDENTIALS: "db/creds" } },
    );
    expect(s.app.name.$value()).toBe("myapp");
    expect(s.app.db.host.$value()).toBe("localhost");
    expect(s.app.db.port.$value()).toBe(5432);
    expect(s.app.feature.enabled.$value()).toBe(false);
    const creds = (await s.app.db.credentials.$resolve()) as { user: string; password: string };
    expect(creds.user).toBe("app_user");
    expect(creds.password).toBe("s3cr3t");
    expect(await s.app.db.credentials.user.$resolve()).toBe("app_user");
    expect(await s.app.db.credentials.password.$resolve()).toBe("s3cr3t");
  });

  it("$refresh() on a child accessor of t.secret({ schema }) returns a new value", async () => {
    let fetchCount = 0;
    const adapter = createMockAdapter({
      fetch: async () => {
        fetchCount++;
        return {
          value: JSON.stringify({ host: `host${fetchCount}` }),
          versionId: `v${fetchCount}`,
        };
      },
    });
    const s = defineSettings(
      { db: t.secret({ adapter, schema: { host: t.string() }, ttl: 0 }) },
      { source: { DB: "db/secret" } },
    );
    expect(await s.db.host.$refresh()).toBe(`host${fetchCount}`);
    expect(fetchCount).toBe(1);
    expect(await s.db.host.$refresh()).toBe(`host${fetchCount}`);
    expect(fetchCount).toBe(2);
  });

  it("can verify child fields of t.secret({ schema }) with the in operator", async () => {
    const adapter = createMockAdapter({
      fetch: async () => ({ value: JSON.stringify({ host: "localhost" }), versionId: "v1" }),
    });
    const s = defineSettings(
      { db: t.secret({ adapter, schema: { host: t.string() } }) },
      { source: { DB: "db/secret" } },
    );
    expect("host" in (s.db as unknown as Record<string, unknown>)).toBe(true);
    expect("$resolve" in (s.db as unknown as Record<string, unknown>)).toBe(true);
    expect("unknown" in (s.db as unknown as Record<string, unknown>)).toBe(false);
    expect((s.db as unknown as Record<string, unknown>).unknown).toBeUndefined();
  });
});
