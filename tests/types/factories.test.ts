import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { defineSettings, SettingsError, type SyncAccessor, types as t } from "../../src/index.js";
import { isType } from "../../src/types/index.js";

const originalEnv = process.env;
beforeEach(async () => {
  process.env = { ...originalEnv };
});
afterEach(async () => {
  process.env = originalEnv;
});

describe("t.String", () => {
  it("reads a string from env", async () => {
    process.env.APP_VALUE = "hello";
    const s = defineSettings({ VALUE: t.string() }, { prefix: "APP_" });
    expect(await s.VALUE.$value()).toBe("hello");
  });

  it("specifies a custom key via key option (prefix is ignored)", async () => {
    process.env.VALUE_X = "hello";
    const s = defineSettings({ VALUE: t.string({ key: "VALUE_X" }) }, { prefix: "APP_" });
    expect(await s.VALUE.$value()).toBe("hello");
  });

  it("uses the default value", async () => {
    const s = defineSettings({ VALUE: t.string({ default: "fallback" }) });
    expect(await s.VALUE.$value()).toBe("fallback");
  });

  it("returns undefined for optional fields", async () => {
    const s = defineSettings({ OPT: t.string({ optional: true }) });
    expect(await s.OPT.$value()).toBeUndefined();
    // expectTypeOf(s.OPT).toEqualTypeOf<SyncAccessor<string | undefined>>(); // TODO: enable when expect-type supports SyncAccessor unions
  });

  it("throws for missing required fields", async () => {
    const s = defineSettings({ VALUE: t.string() });
    await expect(s.$load()).rejects.toThrow();
  });

  it("passes regex validation", async () => {
    process.env.CODE = "abc123";
    const s = defineSettings({ CODE: t.string({ regex: /^[a-z0-9]+$/ }) });
    expect(await s.CODE.$value()).toBe("abc123");
  });

  it("throws InvalidValueError on regex mismatch", async () => {
    process.env.CODE = "INVALID!";
    const s = defineSettings({ CODE: t.string({ regex: /^[a-z0-9]+$/ }) });
    await expect(s.$load()).rejects.toThrow("Invalid value for CODE");
  });

  it("accepts values in the options list", async () => {
    process.env.APP_MODE = "production";
    const s = defineSettings(
      { MODE: t.string({ options: ["development", "production"] as const }) },
      { prefix: "APP_" },
    );
    expect(await s.MODE.$value()).toBe("production");
    // FIXME: expect-type cannot correctly handle union types of SyncAccessor
    // expectTypeOf(s.MODE).toEqualTypeOf<"development" | "production">();
  });

  it("rejects values not in the options list", async () => {
    process.env.MODE = "unknown";
    const s = defineSettings({
      MODE: t.string({ options: ["development", "production"] as const }),
    });
    await expect(s.$load()).rejects.toThrow("Invalid value for MODE");
  });
});

describe("t.Number", () => {
  it("reads a number from env", async () => {
    process.env.APP_PORT = "8080";
    const s = defineSettings({ PORT: t.number() }, { prefix: "APP_" });
    expect(await s.PORT.$value()).toBe(8080);
  });

  it("uses the default value", async () => {
    const s = defineSettings({ PORT: t.number({ default: 3000 }) });
    expect(await s.PORT.$value()).toBe(3000);
  });

  it("rejects non-numeric values", async () => {
    process.env.PORT = "abc";
    const s1 = defineSettings({ PORT: t.number() });
    await expect(s1.$load()).rejects.toThrow("Invalid value for PORT");
  });

  it("rejects values with trailing non-numeric characters", async () => {
    process.env.PORT = "8080abc";
    const s2 = defineSettings({ PORT: t.number() });
    await expect(s2.$load()).rejects.toThrow("Invalid value for PORT");
  });

  it("rejects empty strings", async () => {
    process.env.PORT = "";
    const s3 = defineSettings({ PORT: t.number() });
    await expect(s3.$load()).rejects.toThrow("Invalid value for PORT");
  });

  it("accepts values in the options list", async () => {
    process.env.APP_LEVEL = "3";
    const s = defineSettings(
      { LEVEL: t.number({ options: [1, 3, 5] as const }) },
      { prefix: "APP_" },
    );
    expect(await s.LEVEL.$value()).toBe(3);
    // FIXME: expect-type cannot correctly handle union types of SyncAccessor
    // expectTypeOf(s.LEVEL).toEqualTypeOf<SyncAccessor<1 | 3 | 5>>();
  });

  it("rejects values not in the options list", async () => {
    process.env.LEVEL = "2";
    const s = defineSettings({ LEVEL: t.number({ options: [1, 3, 5] as const }) });
    await expect(s.$load()).rejects.toThrow("Invalid value for LEVEL");
  });

  it("returns undefined when optional and env var is missing", async () => {
    const s = defineSettings({ N: t.number({ optional: true }) });
    expect(await s.N.$value()).toBeUndefined();
  });

  it("rejects non-integer when integer: true", async () => {
    const s = defineSettings({ N: t.number({ integer: true }) }, { source: { N: "3.14" } });
    await expect(s.$load()).rejects.toThrow("is not an integer");
  });

  it("rejects value below min", async () => {
    const s = defineSettings({ N: t.number({ min: 5 }) }, { source: { N: "3" } });
    await expect(s.$load()).rejects.toThrow("less than minimum value 5");
  });

  it("rejects value above max", async () => {
    const s = defineSettings({ N: t.number({ max: 10 }) }, { source: { N: "15" } });
    await expect(s.$load()).rejects.toThrow("greater than maximum value 10");
  });
});

describe("t.Boolean", () => {
  it("'true' → true", async () => {
    process.env.APP_DEBUG = "true";
    const s = defineSettings({ DEBUG: t.boolean() }, { prefix: "APP_" });
    expect(await s.DEBUG.$value()).toBe(true);
  });

  it("'false' → false", async () => {
    process.env.APP_DEBUG = "false";
    const s = defineSettings({ DEBUG: t.boolean() }, { prefix: "APP_" });
    expect(await s.DEBUG.$value()).toBe(false);
  });

  it("accepts custom trueValues", async () => {
    process.env.APP_FLAG = "on";
    const s = defineSettings(
      { FLAG: t.boolean({ trueValues: ["on", "enabled"] }) },
      { prefix: "APP_" },
    );
    expect(await s.FLAG.$value()).toBe(true);
  });

  it("accepts custom falseValues", async () => {
    process.env.APP_FLAG = "off";
    const s = defineSettings(
      { FLAG: t.boolean({ trueValues: ["on"], falseValues: ["off"] }) },
      { prefix: "APP_" },
    );
    expect(await s.FLAG.$value()).toBe(false);
  });

  it("throws InvalidValueError when allowUnrecognized is false", async () => {
    process.env.FLAG = "TYPO";
    const s = defineSettings({ FLAG: t.boolean({ allowUnrecognized: false }) });
    await expect(s.$load()).rejects.toThrow("Invalid value for FLAG");
  });

  it("treats unrecognized values as false by default (backward compat)", async () => {
    process.env.FLAG = "UNKNOWN";
    const s = defineSettings({ FLAG: t.boolean() });
    expect(await s.FLAG.$value()).toBe(false);
  });

  it("interprets mixed/uppercase values case-insensitively", async () => {
    process.env.APP_T = "TRUE";
    process.env.APP_F = "False";
    const s = defineSettings({ T: t.boolean(), F: t.boolean() }, { prefix: "APP_" });
    expect(await s.T.$value()).toBe(true);
    expect(await s.F.$value()).toBe(false);
  });

  it("throws MissingEnvError when no default and not optional", async () => {
    const s = defineSettings({ MISSING_FLAG: t.boolean() });
    await expect(s.$load()).rejects.toThrow(/MISSING_FLAG/);
  });

  it("returns default when env var is missing", async () => {
    const s = defineSettings({ B: t.boolean({ default: true }) });
    expect(await s.B.$value()).toBe(true);
  });

  it("returns undefined when optional and env var is missing", async () => {
    const s = defineSettings({ B: t.boolean({ optional: true }) });
    expect(await s.B.$value()).toBeUndefined();
  });
});

describe("defineSettings: t.Date", () => {
  it("parses ISO 8601 date strings", async () => {
    process.env.APP_SINCE = "2024-01-15";
    const s = defineSettings({ SINCE: t.date() }, { prefix: "APP_" });
    expect(await s.SINCE.$value()).toBeInstanceOf(Date);
    expect(((await s.SINCE.$value()) as Date).getFullYear()).toBe(2024);
  });

  it("parses dates with a custom format", async () => {
    process.env.APP_SINCE = "2024-01-15";
    const s = defineSettings({ SINCE: t.date({ format: "yyyy-MM-dd" }) }, { prefix: "APP_" });
    expect(await s.SINCE.$value()).toBeInstanceOf(Date);
    expect(((await s.SINCE.$value()) as Date).getFullYear()).toBe(2024);
  });

  it("uses a default Date value", async () => {
    const defaultDate = new Date(2020, 0, 1);
    const s = defineSettings({ SINCE: t.date({ default: defaultDate, optional: true }) });
    expect(await s.SINCE.$value()).toBe(defaultDate);
  });

  it("throws MissingEnvError when not optional and no default", async () => {
    const s = defineSettings({ D: t.date() });
    await expect(s.$load()).rejects.toThrow(/D/);
  });

  it("throws on non-ISO date string", async () => {
    const s = defineSettings({ D: t.date() }, { source: { D: "not-a-date" } });
    await expect(s.$load()).rejects.toThrow(/not a valid ISO 8601 date/);
  });

  it("throws on invalid format string", async () => {
    const s = defineSettings(
      { D: t.date({ format: "yyyy-MM-dd" }) },
      { source: { D: "not-a-date" } },
    );
    await expect(s.$load()).rejects.toThrow(/does not match format/);
  });

  it("returns undefined when optional and missing", async () => {
    const s = defineSettings({ D: t.date({ optional: true }) });
    expect(await s.D.$value()).toBeUndefined();
  });

  it("parses time with seconds token (HH:mm:ss format)", async () => {
    const s = defineSettings({ T: t.date({ format: "HH:mm:ss" }) }, { source: { T: "13:30:45" } });
    const d = (await s.T.$value()) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getHours()).toBe(13);
    expect(d.getMinutes()).toBe(30);
    expect(d.getSeconds()).toBe(45);
  });

  it("parses 2-digit year with yy token (len === 2 branch)", async () => {
    const s = defineSettings({ D: t.date({ format: "yy-MM-dd" }) }, { source: { D: "24-06-15" } });
    const d = (await s.D.$value()) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  it("parses 1-digit year token (y token, len=1 branch)", async () => {
    const s = defineSettings({ D: t.date({ format: "y-M-d" }) }, { source: { D: "4-6-5" } });
    const d = (await s.D.$value()) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(5);
  });

  it("escapes regex special chars in format literal (dot separator)", async () => {
    const s = defineSettings(
      { D: t.date({ format: "yyyy.MM.dd" }) },
      { source: { D: "2024.06.15" } },
    );
    const d = (await s.D.$value()) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });
});

describe("t.Array", () => {
  it("reads an array of strings", async () => {
    process.env.APP_TAGS = "foo,bar,baz";
    const s = defineSettings({ TAGS: t.array({ type: t.string() }) }, { prefix: "APP_" });
    expect(await s.TAGS.$value()).toEqual(["foo", "bar", "baz"]);
  });

  it("reads an array of numbers", async () => {
    process.env.APP_PORTS = "3000,4000,5000";
    const s = defineSettings(
      { PORTS: t.array({ type: t.number(), delimiter: "," }) },
      { prefix: "APP_" },
    );
    expect(await s.PORTS.$value()).toEqual([3000, 4000, 5000]);
  });

  it("defaults to comma delimiter", async () => {
    process.env.TAGS = "a,b,c";
    const s = defineSettings({ TAGS: t.array() });
    expect(await s.TAGS.$value()).toEqual(["a", "b", "c"]);
  });

  it("uses the default value", async () => {
    const s = defineSettings({ LIST: t.array({ default: [] }) });
    expect(await s.LIST.$value()).toEqual([]);
  });

  it("treats empty env var as empty array", async () => {
    process.env.TAGS = "";
    const s = defineSettings({ TAGS: t.array() });
    expect(await s.TAGS.$value()).toEqual([]);
  });

  it("throws InvalidValueError on item transformation failure", async () => {
    const s = defineSettings(
      { ITEMS: t.array({ type: t.number() }) },
      { source: { ITEMS: "1,2,three" } },
    );
    await expect(s.$load()).rejects.toThrow(/at index 2/);
  });

  it("throws MissingEnvError when not optional and no default", async () => {
    const s = defineSettings({ ITEMS: t.array() });
    await expect(s.$load()).rejects.toThrow(/ITEMS/);
  });

  it("returns undefined when optional", async () => {
    const s = defineSettings({ ITEMS: t.array({ optional: true }) });
    expect(await s.ITEMS.$value()).toBeUndefined();
  });

  it("re-throws errors that are not InvalidValueError from item type", async () => {
    const s = defineSettings(
      {
        ITEMS: t.array({
          type: t.func(() => {
            throw new Error("boom");
          }),
        }),
      },
      { source: { ITEMS: "x,y" } },
    );
    await expect(s.$load()).rejects.toThrow("boom");
  });
});

describe("t.Json", () => {
  it("parses a JSON object", async () => {
    process.env.APP_DICT = '{"key":"value","num":42}';
    const s = defineSettings({ DICT: t.json() }, { prefix: "APP_" });
    expect(await s.DICT.$value()).toEqual({ key: "value", num: 42 });
  });

  it("rejects invalid JSON", async () => {
    process.env.DICT = "not-json";
    const s = defineSettings({ DICT: t.json() });
    await expect(s.$load()).rejects.toThrow("Invalid value for DICT");
  });

  it("uses the default value", async () => {
    const s = defineSettings({ DICT: t.json({ default: {}, optional: true }) });
    expect(await s.DICT.$value()).toEqual({});
  });

  it("throws MissingEnvError when not optional and no default", async () => {
    const s = defineSettings({ CFG: t.json() });
    await expect(s.$load()).rejects.toThrow(/CFG/);
  });

  it("returns undefined when optional", async () => {
    const s = defineSettings({ CFG: t.json({ optional: true }) });
    expect(await s.CFG.$value()).toBeUndefined();
  });
});

describe("t.Template", () => {
  it("resolves templates referencing other fields", async () => {
    process.env.APP_USER = "admin";
    const s = defineSettings(
      {
        USER: t.string(),
        GREETING: t.template("Hello, {USER}!"),
      },
      { prefix: "APP_" },
    );
    expect(await s.GREETING.$resolve()).toBe("Hello, admin!");
  });

  it("resolves templates with nested group references", async () => {
    process.env.DB_HOST = "pg.example.com";
    process.env.DB_PORT = "5433";
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ key: "DB_HOST" }),
        PORT: t.number({ key: "DB_PORT" }),
        URL: t.template("postgresql://{DATABASE.HOST}:{DATABASE.PORT}/mydb"),
      }),
    });
    expect(s.DATABASE.HOST.$value()).toBe("pg.example.com");
    expect(s.DATABASE.PORT.$value()).toBe(5433);
    expect(await s.DATABASE.URL.$resolve()).toBe("postgresql://pg.example.com:5433/mydb");
  });

  it("replaces multiple placeholders", async () => {
    const s = defineSettings({
      DB_USER: t.string({ default: "admin" }),
      DB_PASS: t.string({ default: "secret" }),
      DB_HOST: t.string({ default: "localhost" }),
      DB_PORT: t.number({ default: 5432 }),
      DB_NAME: t.string({ default: "mydb" }),
      URL: t.template("postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"),
    });
    expect(await s.URL.$resolve()).toBe("postgresql://admin:secret@localhost:5432/mydb");
  });

  it("returns the string as-is when no placeholders are found", async () => {
    const s = defineSettings({
      FOO: t.string({ default: "x" }),
      URL: t.template("no-placeholders"),
    });
    expect(await s.URL.$resolve()).toBe("no-placeholders");
  });

  it("throws on null intermediate value", async () => {
    const s = defineSettings(
      { A: t.constant(null), B: t.template("{A.x}") },
      { source: { A: "" } },
    );
    await expect(s.$load()).rejects.toThrow(/Template reference not found/);
  });

  it("throws SchemaDefinitionError when intermediate path value is null (direct _resolve call)", async () => {
    const tmpl = t.template("{A.x}") as unknown as {
      _resolve: (ctx: {
        raw: undefined;
        source: object;
        values: Record<string, unknown>;
      }) => Promise<string>;
    };
    const mockValues = { A: null };
    await expect(
      tmpl._resolve({ raw: undefined, source: {}, values: mockValues as Record<string, unknown> }),
    ).rejects.toThrow(/Template reference not found/);
  });

  it("correctly resolves templates with duplicate placeholders", async () => {
    const s = defineSettings({
      HOST: t.string({ default: "localhost" }),
      URL: t.template("{HOST}:{HOST}"),
    });
    expect(await s.URL.$resolve()).toBe("localhost:localhost");
  });

  it("returns String(value) when value is not a SyncAccessor (direct _resolve call)", async () => {
    const tmpl = t.template("{A}") as unknown as {
      _resolve: (ctx: {
        raw: undefined;
        source: object;
        values: Record<string, unknown>;
      }) => Promise<string>;
    };
    const mockValues = { A: 42 };
    const result = await tmpl._resolve({
      raw: undefined,
      source: {},
      values: mockValues as Record<string, unknown>,
    });
    expect(result).toBe("42");
  });
});

describe("t.Const / constant values", () => {
  it("returns string constants as-is", async () => {
    const s = defineSettings({ SECRET: "my-secret", FLAG: true, NUM: 42 });
    expect((s.SECRET as { $value(): unknown }).$value()).toBe("my-secret");
    expect((s.FLAG as { $value(): unknown }).$value()).toBe(true);
    expect((s.NUM as { $value(): unknown }).$value()).toBe(42);
  });

  it("returns Date constants as-is", async () => {
    const today = new Date(2024, 0, 1);
    const s = defineSettings({ TODAY: today });
    expect((s.TODAY as { $value(): unknown }).$value()).toBe(today);
  });

  it("returns array constants as-is", async () => {
    const s = defineSettings({ TAGS: ["a", "b", "c"] as const });
    expect((s.TAGS as { $value(): unknown }).$value()).toEqual(["a", "b", "c"]);
  });

  it("returns plain object constants as-is", async () => {
    const s = defineSettings({ META: { host: "localhost", port: 5432 } });
    expect((s.META as { $value(): unknown }).$value()).toEqual({ host: "localhost", port: 5432 });
  });

  it("t.constant returns the value as-is", async () => {
    const s = defineSettings({ SECRET: t.constant("my-secret") });
    expect(await s.SECRET.$value()).toBe("my-secret");
    expectTypeOf(s.SECRET).toEqualTypeOf<SyncAccessor<"my-secret">>();
  });

  it("t.constant works with numbers", async () => {
    const s = defineSettings({ PORT: t.constant(8080) });
    expect(await s.PORT.$value()).toBe(8080);
    expectTypeOf(s.PORT).toEqualTypeOf<SyncAccessor<8080>>();
  });

  it("t.constant works with booleans", async () => {
    const s = defineSettings({ FLAG: t.constant(false) });
    expect(await s.FLAG.$value()).toBe(false);
    expectTypeOf(s.FLAG).toEqualTypeOf<SyncAccessor<false>>();
  });

  it("t.constant works with Date objects", async () => {
    const now = new Date();
    const s = defineSettings({ TODAY: t.constant(now) });
    expect(await s.TODAY.$value()).toBe(now);
    // TODO(Task9): In the new design, Date is SyncAccessor<Date> only (no & Date intersection)
    expectTypeOf(s.TODAY).toEqualTypeOf<SyncAccessor<Date>>();
  });

  it("t.constant works with arrays", async () => {
    const arr = [1, 2, 3] as const;
    const s = defineSettings({ LIST: t.constant(arr) });
    expect(await s.LIST.$value()).toEqual([1, 2, 3]);
    // TODO(Task9): In the new design, arrays are SyncAccessor<T> only (no & array intersection)
    expectTypeOf(s.LIST).toEqualTypeOf<SyncAccessor<readonly [1, 2, 3]>>();
  });

  it("t.constant works with objects", async () => {
    const obj = { host: "localhost", port: 8080 };
    const s = defineSettings({ META: t.constant(obj) });
    expect(await s.META.$value()).toEqual({ host: "localhost", port: 8080 });
  });
});

describe("t.Func", () => {
  it("computes value from raw env source", async () => {
    process.env.MY_VAL = "from-env";
    const s = defineSettings({
      RESULT: t.func(({ source }) => source.MY_VAL),
    });
    expect(await s.RESULT.$value()).toBe("from-env");
  });

  it("computes value from other resolved fields", async () => {
    process.env.APP_USER = "alice";
    const s = defineSettings(
      {
        USER: t.string(),
        GREETING: t.func(({ values }) => `Hello, ${values.USER.$value()}!`),
      },
      { prefix: "APP_" },
    );
    expect(await s.GREETING.$value()).toBe("Hello, alice!");
  });

  it("accesses earlier func field results via values", async () => {
    process.env.APP_FIRST = "Jane";
    process.env.APP_LAST = "Doe";
    const s = defineSettings(
      {
        FIRST: t.string(),
        LAST: t.string(),
        FULL: t.func(({ values }) => `${values.FIRST.$value()} ${values.LAST.$value()}`),
      },
      { prefix: "APP_" },
    );
    expect(await s.FULL.$value()).toBe("Jane Doe");
  });

  it("works with default values from other fields", async () => {
    const s = defineSettings({
      HOST: t.string({ default: "localhost" }),
      URL: t.func(({ values }) => `https://${values.HOST.$value()}:8080`),
    });
    expect(await s.URL.$value()).toBe("https://localhost:8080");
  });

  it("re-throws SettingsError as SettingsValidationError", async () => {
    process.env.FLAG = "bad";
    const s = defineSettings({
      FLAG: t.string(),
      CHECK: t.func(({ values }) => {
        if (values.FLAG.$value() === "bad") throw new SettingsError("flag is bad");
        return "ok";
      }),
    });
    await expect(s.$load()).rejects.toThrow(SettingsError);
  });

  it("func accesses numeric default from other field", async () => {
    const s = defineSettings({
      PORT: t.number({ default: 3000 }),
      DISPLAY: t.func(({ values }) => `Port: ${values.PORT.$value()}`),
    });
    expect(await s.DISPLAY.$value()).toBe("Port: 3000");
  });
});

describe("func with ttl option", () => {
  it("sets _cache.ttl on TypeDef", () => {
    const def = t.func(() => 42, { ttl: 5000 });
    expect((def as unknown as { _cache: { ttl: number } })._cache?.ttl).toBe(5000);
  });

  it("_cache is undefined when ttl is not specified", () => {
    const def = t.func(() => 42);
    expect((def as unknown as { _cache?: unknown })._cache).toBeUndefined();
  });
});

describe("t.URL", () => {
  it("parses valid URL from env", async () => {
    const s = defineSettings(
      { MY_URL: t.url() },
      { source: { MY_URL: "https://example.com:8080/path?q=1" } },
    );
    const url = (await s.MY_URL.$value()) as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe("example.com");
    expect(url.port).toBe("8080");
    expect(url.pathname).toBe("/path");
    expect(url.search).toBe("?q=1");
  });

  it("throws on invalid URL", async () => {
    const s = defineSettings({ MY_URL: t.url() }, { source: { MY_URL: "not-a-url" } });
    await expect(s.$load()).rejects.toThrow("Invalid value for MY_URL");
  });

  it("uses default value", async () => {
    const defaultUrl = new URL("https://default.com");
    const s = defineSettings({ MY_URL: t.url({ default: defaultUrl }) });
    const url = (await s.MY_URL.$value()) as URL;
    expect(url.hostname).toBe("default.com");
  });

  it("returns undefined for optional field", async () => {
    const s = defineSettings({ MY_URL: t.url({ optional: true }) });
    expect(await s.MY_URL.$value()).toBeUndefined();
  });

  it("throws MissingEnvError for required field with no env", async () => {
    const s = defineSettings({ MY_URL: t.url() });
    await expect(s.$load()).rejects.toThrow();
  });
});

describe("t.Duration", () => {
  it("parses '5m' as 300000ms", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "5m" } });
    expect(await s.TIMEOUT.$value()).toBe(300000);
  });

  it("parses '500ms' as 500", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "500ms" } });
    expect(await s.TIMEOUT.$value()).toBe(500);
  });

  it("parses '5s' as 5000", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "5s" } });
    expect(await s.TIMEOUT.$value()).toBe(5000);
  });

  it("parses '2h' as 7200000", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "2h" } });
    expect(await s.TIMEOUT.$value()).toBe(7200000);
  });

  it("parses '1d' as 86400000", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "1d" } });
    expect(await s.TIMEOUT.$value()).toBe(86400000);
  });

  it("parses '1w' as 604800000", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "1w" } });
    expect(await s.TIMEOUT.$value()).toBe(604800000);
  });

  it("parses bare number string as milliseconds", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "30000" } });
    expect(await s.TIMEOUT.$value()).toBe(30000);
  });

  it("parses with optional whitespace between number and suffix", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "5 m" } });
    expect(await s.TIMEOUT.$value()).toBe(300000);
  });

  it("uses default value", async () => {
    const s = defineSettings({ TIMEOUT: t.duration({ default: 1000 }) });
    expect(await s.TIMEOUT.$value()).toBe(1000);
  });

  it("returns undefined for optional field", async () => {
    const s = defineSettings({ TIMEOUT: t.duration({ optional: true }) });
    expect(await s.TIMEOUT.$value()).toBeUndefined();
  });

  it("throws on invalid format", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "abc" } });
    await expect(s.$load()).rejects.toThrow("Invalid value for TIMEOUT");
  });

  it("throws on negative number", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() }, { source: { TIMEOUT: "-5m" } });
    await expect(s.$load()).rejects.toThrow("Invalid value for TIMEOUT");
  });

  it("throws MissingEnvError for required field with no env", async () => {
    const s = defineSettings({ TIMEOUT: t.duration() });
    await expect(s.$load()).rejects.toThrow();
  });
});

describe("objectType", () => {
  it("t.object() returns a TypeDef", () => {
    const obj = t.object({ HOST: t.string({ default: "localhost" }) });
    expect(isType(obj)).toBe(true);
  });

  it("t.object() sets the child schema on _schema", () => {
    const schema = { HOST: t.string({ default: "localhost" }) };
    const obj = t.object(schema) as unknown as { _schema: unknown };
    expect(obj._schema).toBe(schema);
  });

  it("t.object() sets _objectPrefix when the prefix option is passed", () => {
    const obj = t.object(
      { HOST: t.string({ default: "localhost" }) },
      { prefix: "" },
    ) as unknown as { _objectPrefix: unknown };
    expect(obj._objectPrefix).toBe("");
  });

  it("using t.object() with defineSettings allows getting the entire object via $value()", async () => {
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ default: "localhost" }),
        PORT: t.number({ default: 5432 }),
      }),
    });
    const dbValue = await s.DATABASE.$value();
    expect(dbValue).toMatchObject({ HOST: "localhost", PORT: 5432 });
  });

  it("child fields of t.object() are also accessible via $value()", async () => {
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ default: "localhost" }),
        PORT: t.number({ default: 5432 }),
      }),
    });
    expect(await s.DATABASE.HOST.$value()).toBe("localhost");
    expect(await s.DATABASE.PORT.$value()).toBe(5432);
  });

  it("passing prefix: '' to t.object() removes only the global prefix while retaining the group key", async () => {
    const s = defineSettings(
      {
        DATABASE: t.object(
          {
            HOST: t.string({ default: "localhost" }),
          },
          { prefix: "" },
        ),
      },
      { prefix: "APP_", source: { DATABASE_HOST: "db.example.com" } },
    );
    expect(await s.DATABASE.HOST.$value()).toBe("db.example.com");
  });

  it("the prefix option of t.object() overrides the global prefix while preserving the group key", async () => {
    const s = defineSettings(
      {
        group: t.object(
          {
            value1: t.string({ default: "d1" }),
            value2: t.string({ prefix: "XXX_", default: "d2" }),
            value3: t.string({ key: "EXTRA_VALUE", default: "d3" }),
          },
          { prefix: "APP_" },
        ),
      },
      {
        source: {
          APP_GROUP_VALUE1: "v1",
          XXX_GROUP_VALUE2: "v2",
          EXTRA_VALUE: "v3",
        },
      },
    );
    expect(s.group.value1.$value()).toBe("v1");
    expect(s.group.value2.$value()).toBe("v2");
    expect(s.group.value3.$value()).toBe("v3");
  });

  it("$value() of t.object() returns the latest value even after $mutate", async () => {
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ default: "localhost" }),
        PORT: t.number({ default: 5432 }),
      }),
    });
    expect(await s.DATABASE.$value()).toMatchObject({ HOST: "localhost", PORT: 5432 });
    s.$mutate({ DATABASE: { HOST: "remotehost" } });
    expect(await s.DATABASE.$value()).toMatchObject({ HOST: "remotehost", PORT: 5432 });
    s.$reset();
    expect(await s.DATABASE.$value()).toMatchObject({ HOST: "localhost", PORT: 5432 });
  });

  it("objectType._resolve() returns empty object when called directly", () => {
    const obj = t.object({ HOST: t.string({ default: "localhost" }) }) as unknown as {
      _resolve: (ctx: unknown) => unknown;
    };
    const result = obj._resolve({ raw: undefined, source: {}, values: {} });
    expect(result).toEqual({});
  });
});
