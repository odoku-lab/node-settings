import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { fields as f, loadSettings, SettingsValidationError } from "../src/index.js";

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
});
afterEach(() => {
  process.env = originalEnv;
});

describe("loadSettings: f.String", () => {
  it("reads a string from env", () => {
    process.env.APP_VALUE = "hello";
    const s = loadSettings({ VALUE: f.String() }, { prefix: "APP_" });
    expect(s.VALUE).toBe("hello");
  });

  it("specifies a custom key via key option", () => {
    process.env.APP_VALUE_X = "hello";
    const s = loadSettings({ VALUE: f.String({ key: "VALUE_X" }) }, { prefix: "APP_" });
    expect(s.VALUE).toBe("hello");
  });

  it("uses the default value", () => {
    const s = loadSettings({ VALUE: f.String({ default: "fallback" }) });
    expect(s.VALUE).toBe("fallback");
  });

  it("returns undefined for optional fields", () => {
    const s = loadSettings({ OPT: f.String({ optional: true }) });
    expect(s.OPT).toBeUndefined();
    expectTypeOf(s.OPT).toEqualTypeOf<string | undefined>();
  });

  it("throws SettingsValidationError for missing required fields", () => {
    expect(() => loadSettings({ VALUE: f.String() })).toThrow(SettingsValidationError);
  });

  it("passes regex validation", () => {
    process.env.CODE = "abc123";
    const s = loadSettings({ CODE: f.String({ regex: /^[a-z0-9]+$/ }) });
    expect(s.CODE).toBe("abc123");
  });

  it("throws InvalidValueError on regex mismatch", () => {
    process.env.CODE = "INVALID!";
    expect(() => loadSettings({ CODE: f.String({ regex: /^[a-z0-9]+$/ }) })).toThrow(
      "Invalid value for CODE",
    );
  });

  it("accepts values in the options list", () => {
    process.env.APP_MODE = "production";
    const s = loadSettings(
      { MODE: f.String({ options: ["development", "production"] as const }) },
      { prefix: "APP_" },
    );
    expect(s.MODE).toBe("production");
    expectTypeOf(s.MODE).toEqualTypeOf<"development" | "production">();
  });

  it("rejects values not in the options list", () => {
    process.env.MODE = "unknown";
    expect(() =>
      loadSettings({ MODE: f.String({ options: ["development", "production"] as const }) }),
    ).toThrow("Invalid value for MODE");
  });
});

describe("loadSettings: f.Number", () => {
  it("reads a number from env", () => {
    process.env.APP_PORT = "8080";
    const s = loadSettings({ PORT: f.Number() }, { prefix: "APP_" });
    expect(s.PORT).toBe(8080);
  });

  it("uses the default value", () => {
    const s = loadSettings({ PORT: f.Number({ default: 3000 }) });
    expect(s.PORT).toBe(3000);
  });

  it("rejects non-numeric values", () => {
    process.env.PORT = "abc";
    expect(() => loadSettings({ PORT: f.Number() })).toThrow("Invalid value for PORT");
  });

  it("rejects values with trailing non-numeric characters", () => {
    process.env.PORT = "8080abc";
    expect(() => loadSettings({ PORT: f.Number() })).toThrow("Invalid value for PORT");
  });

  it("rejects empty strings", () => {
    process.env.PORT = "";
    expect(() => loadSettings({ PORT: f.Number() })).toThrow("Invalid value for PORT");
  });

  it("accepts values in the options list", () => {
    process.env.APP_LEVEL = "3";
    const s = loadSettings(
      { LEVEL: f.Number({ options: [1, 3, 5] as const }) },
      { prefix: "APP_" },
    );
    expect(s.LEVEL).toBe(3);
    expectTypeOf(s.LEVEL).toEqualTypeOf<1 | 3 | 5>();
  });

  it("rejects values not in the options list", () => {
    process.env.LEVEL = "2";
    expect(() => loadSettings({ LEVEL: f.Number({ options: [1, 3, 5] as const }) })).toThrow(
      "Invalid value for LEVEL",
    );
  });
});

describe("loadSettings: f.Boolean", () => {
  it("'true' → true", () => {
    process.env.APP_DEBUG = "true";
    const s = loadSettings({ DEBUG: f.Boolean() }, { prefix: "APP_" });
    expect(s.DEBUG).toBe(true);
  });

  it("'false' → false", () => {
    process.env.APP_DEBUG = "false";
    const s = loadSettings({ DEBUG: f.Boolean() }, { prefix: "APP_" });
    expect(s.DEBUG).toBe(false);
  });

  it("accepts custom trueValues", () => {
    process.env.APP_FLAG = "on";
    const s = loadSettings(
      { FLAG: f.Boolean({ trueValues: ["on", "enabled"] }) },
      { prefix: "APP_" },
    );
    expect(s.FLAG).toBe(true);
  });

  it("accepts custom falseValues", () => {
    process.env.APP_FLAG = "off";
    const s = loadSettings(
      { FLAG: f.Boolean({ trueValues: ["on"], falseValues: ["off"] }) },
      { prefix: "APP_" },
    );
    expect(s.FLAG).toBe(false);
  });

  it("throws InvalidValueError when allowUnrecognized is false", () => {
    process.env.FLAG = "TYPO";
    expect(() => loadSettings({ FLAG: f.Boolean({ allowUnrecognized: false }) })).toThrow(
      "Invalid value for FLAG",
    );
  });

  it("treats unrecognized values as false by default (backward compat)", () => {
    process.env.FLAG = "UNKNOWN";
    const s = loadSettings({ FLAG: f.Boolean() });
    expect(s.FLAG).toBe(false);
  });

  it("interprets mixed/uppercase values case-insensitively", () => {
    process.env.APP_T = "TRUE";
    process.env.APP_F = "False";
    const s = loadSettings({ T: f.Boolean(), F: f.Boolean() }, { prefix: "APP_" });
    expect(s.T).toBe(true);
    expect(s.F).toBe(false);
  });
});

describe("loadSettings: f.Date", () => {
  it("parses ISO 8601 date strings", () => {
    process.env.APP_SINCE = "2024-01-15";
    const s = loadSettings({ SINCE: f.Date() }, { prefix: "APP_" });
    expect(s.SINCE).toBeInstanceOf(Date);
    expect((s.SINCE as Date).getFullYear()).toBe(2024);
  });

  it("parses dates with a custom format", () => {
    process.env.APP_SINCE = "2024-01-15";
    const s = loadSettings({ SINCE: f.Date({ format: "yyyy-MM-dd" }) }, { prefix: "APP_" });
    expect(s.SINCE).toBeInstanceOf(Date);
    expect((s.SINCE as Date).getFullYear()).toBe(2024);
  });

  it("uses a default Date value", () => {
    const defaultDate = new Date(2020, 0, 1);
    const s = loadSettings({ SINCE: f.Date({ default: defaultDate, optional: true }) });
    expect(s.SINCE).toBe(defaultDate);
  });
});

describe("loadSettings: f.Array", () => {
  it("reads an array of strings", () => {
    process.env.APP_TAGS = "foo,bar,baz";
    const s = loadSettings({ TAGS: f.Array({ type: f.String() }) }, { prefix: "APP_" });
    expect(s.TAGS).toEqual(["foo", "bar", "baz"]);
  });

  it("reads an array of numbers", () => {
    process.env.APP_PORTS = "3000,4000,5000";
    const s = loadSettings(
      { PORTS: f.Array({ type: f.Number(), delimiter: "," }) },
      { prefix: "APP_" },
    );
    expect(s.PORTS).toEqual([3000, 4000, 5000]);
  });

  it("defaults to comma delimiter", () => {
    process.env.TAGS = "a,b,c";
    const s = loadSettings({ TAGS: f.Array() });
    expect(s.TAGS).toEqual(["a", "b", "c"]);
  });

  it("uses the default value", () => {
    const s = loadSettings({ LIST: f.Array({ default: [] }) });
    expect(s.LIST).toEqual([]);
  });

  it("treats empty env var as empty array", () => {
    process.env.TAGS = "";
    const s = loadSettings({ TAGS: f.Array() });
    expect(s.TAGS).toEqual([]);
  });
});

describe("loadSettings: f.Json", () => {
  it("parses a JSON object", () => {
    process.env.APP_DICT = '{"key":"value","num":42}';
    const s = loadSettings({ DICT: f.Json() }, { prefix: "APP_" });
    expect(s.DICT).toEqual({ key: "value", num: 42 });
  });

  it("rejects invalid JSON", () => {
    process.env.DICT = "not-json";
    expect(() => loadSettings({ DICT: f.Json() })).toThrow("Invalid value for DICT");
  });

  it("uses the default value", () => {
    const s = loadSettings({ DICT: f.Json({ default: {}, optional: true }) });
    expect(s.DICT).toEqual({});
  });
});

describe("loadSettings: f.Template", () => {
  it("resolves templates referencing other fields", () => {
    process.env.APP_USER = "admin";
    const s = loadSettings(
      {
        USER: f.String(),
        GREETING: f.Template("Hello, {USER}!"),
      },
      { prefix: "APP_" },
    );
    expect(s.GREETING).toBe("Hello, admin!");
  });

  it("resolves templates with nested group references", () => {
    process.env.DB_HOST = "pg.example.com";
    process.env.DB_PORT = "5433";
    const s = loadSettings({
      DATABASE: {
        HOST: f.String({ key: { name: "DB_HOST", prefix: "" } }),
        PORT: f.Number({ key: { name: "DB_PORT", prefix: "" } }),
        URL: f.Template("postgresql://{DATABASE.HOST}:{DATABASE.PORT}/mydb"),
      },
    });
    expect(s.DATABASE.HOST).toBe("pg.example.com");
    expect(s.DATABASE.PORT).toBe(5433);
    expect(s.DATABASE.URL).toBe("postgresql://pg.example.com:5433/mydb");
  });
});

describe("loadSettings: constant values", () => {
  it("returns string constants as-is", () => {
    const s = loadSettings({ SECRET: "my-secret", FLAG: true, NUM: 42 });
    expect(s.SECRET).toBe("my-secret");
    expect(s.FLAG).toBe(true);
    expect(s.NUM).toBe(42);
    expectTypeOf(s.SECRET).toEqualTypeOf<"my-secret">();
    expectTypeOf(s.FLAG).toEqualTypeOf<true>();
    expectTypeOf(s.NUM).toEqualTypeOf<42>();
  });

  it("returns Date constants as-is", () => {
    const today = new Date(2024, 0, 1);
    const s = loadSettings({ TODAY: today });
    expect(s.TODAY).toBe(today);
    expectTypeOf(s.TODAY).toEqualTypeOf<Date>();
  });

  it("returns array constants as-is", () => {
    const s = loadSettings({ TAGS: ["a", "b", "c"] as const });
    expect(s.TAGS).toEqual(["a", "b", "c"]);
    expectTypeOf(s.TAGS).toEqualTypeOf<readonly ["a", "b", "c"]>();
  });

  it("returns plain object constants as-is", () => {
    const s = loadSettings({ META: { host: "localhost", port: 5432 } });
    expect(s.META).toEqual({ host: "localhost", port: 5432 });
  });
});

describe("loadSettings: nested groups", () => {
  it("resolves groups containing field definitions", () => {
    process.env.DB_HOST = "pg.example.com";
    process.env.DB_PORT = "5432";
    const s = loadSettings({
      DATABASE: {
        HOST: f.String({ key: { name: "DB_HOST", prefix: "" } }),
        PORT: f.Number({ key: { name: "DB_PORT", prefix: "" } }),
      },
    });
    expect(s.DATABASE.HOST).toBe("pg.example.com");
    expect(s.DATABASE.PORT).toBe(5432);
  });
});

describe("loadSettings: error aggregation", () => {
  it("reports multiple missing fields together", () => {
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({ FOO: f.String(), BAR: f.Number(), BAZ: f.Boolean() });
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(3);
    expect(caught?.message).toContain("FOO");
    expect(caught?.message).toContain("BAR");
    expect(caught?.message).toContain("BAZ");
  });
});

describe("loadSettings: envFile", () => {
  it("reads values from envFile", () => {
    const envPath = join(tmpdir(), `settings-test-${Date.now()}.env`);
    writeFileSync(envPath, "APP_FROM_FILE=loaded-from-file\n");
    try {
      const s = loadSettings({ FROM_FILE: f.String() }, { prefix: "APP_", envFile: envPath });
      expect(s.FROM_FILE).toBe("loaded-from-file");
      expect(process.env.APP_FROM_FILE).toBeUndefined();
    } finally {
      unlinkSync(envPath);
    }
  });
});

describe("loadSettings: prefix option", () => {
  it("applies prefix to all fields", () => {
    process.env.APP_PORT = "9000";
    const s = loadSettings({ PORT: f.Number() }, { prefix: "APP_" });
    expect(s.PORT).toBe(9000);
  });

  it("overrides prefix with key { name, prefix }", () => {
    process.env.MY_VALUE = "overridden";
    const s = loadSettings(
      { VALUE: f.String({ key: { name: "MY_VALUE", prefix: "" } }) },
      { prefix: "APP_" },
    );
    expect(s.VALUE).toBe("overridden");
  });
});

describe("loadSettings: constants mixed with fields", () => {
  it("returns constants as-is alongside resolved fields", () => {
    const s = loadSettings({
      PORT: f.Number({ default: 8080 }),
      HOST: f.String({ default: "localhost" }),
      SECRET: "mysecret",
    });
    expect(s.PORT).toBe(8080);
    expect(s.HOST).toBe("localhost");
    expect(s.SECRET).toBe("mysecret");
  });

  it("does not read env for constant values", () => {
    process.env.SECRET = "env_secret";
    const s = loadSettings({
      SECRET: "constant_value",
    });
    expect(s.SECRET).toBe("constant_value");
  });
});
