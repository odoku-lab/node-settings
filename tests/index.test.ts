import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineSettings, SchemaDefinitionError, types as t } from "../src/index.js";

const originalEnv = process.env;
beforeEach(async () => {
  process.env = { ...originalEnv };
});
afterEach(async () => {
  process.env = originalEnv;
});

describe("nested groups", () => {
  it("resolves groups containing field definitions", async () => {
    process.env.DB_HOST = "pg.example.com";
    process.env.DB_PORT = "5432";
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ key: "DB_HOST" }),
        PORT: t.number({ key: "DB_PORT" }),
      }),
    });
    expect(s.DATABASE.HOST.$value()).toBe("pg.example.com");
    expect(s.DATABASE.PORT.$value()).toBe(5432);
  });
});

describe("nested group envKey resolution", () => {
  it("explicit key overrides group prefix", async () => {
    process.env.CUSTOM = "custom-val";
    const s = defineSettings(
      {
        DATABASE: t.object({
          NAME: t.string({ key: "CUSTOM" }),
        }),
      },
      { prefix: "APP_" },
    );
    expect(s.DATABASE.NAME.$value()).toBe("custom-val");
  });

  it("Func at top-level accesses group values", async () => {
    process.env.APP_TOP = "top-val";
    process.env.APP_GROUP_X = "x-val";
    const s = defineSettings(
      {
        TOP: t.string(),
        GROUP: t.object({
          X: t.string(),
        }),
        COMPUTED: t.func(({ values }) => {
          const group = values.GROUP as unknown as Record<string, { $value(): unknown }>;
          return `${values.TOP.$value()}-${group.X.$value()}`;
        }),
      },
      { prefix: "APP_" },
    );
    expect(s.COMPUTED.$value()).toBe("top-val-x-val");
  });
});

describe("prefix option", () => {
  it("applies prefix to all fields", async () => {
    process.env.APP_PORT = "9000";
    const s = defineSettings({ PORT: t.number() }, { prefix: "APP_" });
    expect(s.PORT.$value()).toBe(9000);
  });

  it("overrides prefix with key { name, prefix }", async () => {
    process.env.MY_VALUE = "overridden";
    const s = defineSettings({ VALUE: t.string({ key: "MY_VALUE" }) }, { prefix: "APP_" });
    expect(s.VALUE.$value()).toBe("overridden");
  });

  it("key { prefix } without name falls back to schema key", async () => {
    const s = defineSettings({ VALUE: t.string({ prefix: "CUSTOM_" }) });
    await expect(s.$load()).rejects.toThrow(/VALUE/);
  });
});

describe("constants mixed with fields", () => {
  it("returns constants as-is alongside resolved fields", async () => {
    const s = defineSettings({
      PORT: t.number({ default: 8080 }),
      HOST: t.string({ default: "localhost" }),
      SECRET: t.constant("mysecret"),
    });
    expect(s.PORT.$value()).toBe(8080);
    expect(s.HOST.$value()).toBe("localhost");
    expect(s.SECRET.$value()).toBe("mysecret");
  });

  it("does not read env for constant values", async () => {
    process.env.SECRET = "env_secret";
    const s = defineSettings({
      SECRET: t.constant("constant_value"),
    });
    expect(s.SECRET.$value()).toBe("constant_value");
  });
});

describe("source option", () => {
  it("reads from explicit source instead of process.env", async () => {
    process.env.EXTERNAL = "should-not-appear";
    const s = defineSettings({ KEY: t.string() }, { source: { KEY: "from-source" } });
    expect(s.KEY.$value()).toBe("from-source");
  });

  it("ignores process.env when source is provided", async () => {
    process.env.ONLY_PROCESS = "env-val";
    const s = defineSettings({ KEY: t.string({ default: "fallback" }) }, { source: {} });
    expect(s.KEY.$value()).toBe("fallback");
  });

  it("falls back to process.env when source is omitted", async () => {
    process.env.PROCESS_KEY = "from-process";
    const s = defineSettings({ PROCESS_KEY: t.string() });
    expect(s.PROCESS_KEY.$value()).toBe("from-process");
  });
});

describe("mutate/reset", () => {
  it("mutate a single primitive field", async () => {
    const s = defineSettings({ VALUE: t.string({ default: "aaa" }) });
    expect(s.VALUE.$value()).toBe("aaa");
    s.$mutate({ VALUE: "bbb" });
    expect(s.VALUE.$value()).toBe("bbb");
    s.$reset();
    expect(s.VALUE.$value()).toBe("aaa");
  });

  it("mutate multiple fields at once", async () => {
    const s = defineSettings({
      HOST: t.string({ default: "localhost" }),
      PORT: t.number({ default: 5432 }),
    });
    s.$mutate({ HOST: "remote", PORT: 8080 });
    expect(s.HOST.$value()).toBe("remote");
    expect(s.PORT.$value()).toBe(8080);
  });

  it("mutate a nested group field", async () => {
    const s = defineSettings({
      DB: t.object({
        HOST: t.string({ default: "localhost" }),
        PORT: t.number({ default: 5432 }),
      }),
    });
    s.$mutate({ DB: { HOST: "remote" } });
    expect(s.DB.HOST.$value()).toBe("remote");
    expect(s.DB.PORT.$value()).toBe(5432);
  });

  it("reset restores all fields", async () => {
    const s = defineSettings({
      A: t.string({ default: "a" }),
      B: t.number({ default: 1 }),
    });
    s.$mutate({ A: "changed", B: 99 });
    s.$reset();
    expect(s.A.$value()).toBe("a");
    expect(s.B.$value()).toBe(1);
  });

  it("spread operator uses current values", async () => {
    const s = defineSettings({ A: t.string({ default: "a" }), B: t.string({ default: "b" }) });
    s.$mutate({ A: "mutated" });
    const copy = { ...s };
    expect(copy.A.$value()).toBe("mutated");
    expect(copy.B.$value()).toBe("b");
  });
});

describe("changeCase", () => {
  it("converts camelCase key to CONSTANT_CASE env var by default", async () => {
    process.env.MY_VAL = "hello";
    const s = defineSettings({ myVal: t.string() });
    expect(s.myVal.$value()).toBe("hello");
  });

  it("does not convert when changeCase is false", async () => {
    process.env.myVal = "hello";
    const s = defineSettings({ myVal: t.string() }, { changeCase: false });
    expect(s.myVal.$value()).toBe("hello");
  });

  it("explicit key override is not affected by changeCase", async () => {
    process.env.CUSTOM_KEY = "custom";
    const s = defineSettings({ field: t.string({ key: "CUSTOM_KEY" }) }, { changeCase: true });
    expect(s.field.$value()).toBe("custom");
  });

  it("works with prefix option", async () => {
    process.env.APP_DB_HOST = "pg.example.com";
    const s = defineSettings({ db: t.object({ host: t.string() }) }, { prefix: "APP_" });
    expect(s.db.host.$value()).toBe("pg.example.com");
  });

  it("works with nested groups", async () => {
    process.env.DB_HOST = "localhost";
    process.env.DB_PORT = "5432";
    const s = defineSettings(
      {
        db: t.object({
          host: t.string(),
          port: t.number(),
        }),
      },
      { prefix: "" },
    );
    expect(s.db.host.$value()).toBe("localhost");
    expect(s.db.port.$value()).toBe(5432);
  });

  it("deferred fields use converted keys", async () => {
    process.env.APP_USER = "admin";
    const s = defineSettings(
      {
        user: t.string(),
        greeting: t.template("Hello, {user}!"),
      },
      { prefix: "APP_" },
    );
    expect(await s.greeting.$resolve()).toBe("Hello, admin!");
  });

  it("func fields use converted env var names", async () => {
    process.env.MY_VAL = "42";
    const s = defineSettings({
      myVal: t.number(),
      display: t.func(({ values }) => `Value: ${values.myVal.$value()}`),
    });
    expect(s.display.$value()).toBe("Value: 42");
  });

  it("changeCase: false with nested groups and explicit keys", async () => {
    process.env.db_host = "localhost";
    const s = defineSettings(
      {
        db: t.object({ host: t.string() }),
      },
      { prefix: "", changeCase: false },
    );
    expect(s.db.host.$value()).toBe("localhost");
  });
});

it("throws SchemaDefinitionError when a reserved key is used", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test
  expect(() => defineSettings({ $mutate: t.string({ default: "x" }) } as any)).toThrow(
    SchemaDefinitionError,
  );
  // biome-ignore lint/suspicious/noExplicitAny: test
  expect(() => defineSettings({ $reset: t.string({ default: "x" }) } as any)).toThrow(
    SchemaDefinitionError,
  );
  // biome-ignore lint/suspicious/noExplicitAny: test
  expect(() => defineSettings({ $load: t.string({ default: "x" }) } as any)).toThrow(
    SchemaDefinitionError,
  );
});

it("$mutate with null-prototype object mutates nested group fields", () => {
  const s = defineSettings(
    { G: t.object({ X: t.string({ default: "original" }) }) },
    { source: {} },
  );
  const override = Object.create(null) as Record<string, unknown>;
  override.X = "from-null-proto";
  s.$mutate({ G: override });
  expect((s.G.X as { $value(): string }).$value()).toBe("from-null-proto");
});
