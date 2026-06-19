import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defineSettings,
  InvalidValueError,
  MissingEnvError,
  SchemaDefinitionError,
  SettingsValidationError,
  types as t,
} from "../src/index.js";

const originalEnv = process.env;
beforeEach(async () => {
  process.env = { ...originalEnv };
});
afterEach(async () => {
  process.env = originalEnv;
});

describe("backward references", () => {
  it("Template references a non-deferred field defined later", async () => {
    const s = defineSettings({
      GREETING: t.template("Hello, {NAME}!"),
      NAME: t.string({ default: "World" }),
    });
    expect(await s.GREETING.$resolve()).toBe("Hello, World!");
  });

  it("Template references a nested group defined later", async () => {
    const s = defineSettings({
      URL: t.template("postgresql://{DB.HOST}:{DB.PORT}/mydb"),
      DB: t.object({
        HOST: t.string({ default: "localhost" }),
        PORT: t.number({ default: 5432 }),
      }),
    });
    expect(await s.URL.$resolve()).toBe("postgresql://localhost:5432/mydb");
  });

  it("Func references a non-deferred field defined later", async () => {
    const s = defineSettings({
      COMPUTED: t.func(({ values }) => `That is ${values.NAME.$value()}`),
      NAME: t.string({ default: "Alice" }),
    });
    expect(s.COMPUTED.$value()).toBe("That is Alice");
  });

  it("Func references a nested group defined later", async () => {
    const s = defineSettings({
      COMPUTED: t.func(
        ({ values }) =>
          `Host: ${(values.GROUP as unknown as Record<string, { $value(): unknown }>).HOST.$value()}`,
      ),
      GROUP: t.object({
        HOST: t.string({ default: "example.com" }),
      }),
    });
    expect(s.COMPUTED.$value()).toBe("Host: example.com");
  });

  it("Template references another Template (deferred→deferred)", async () => {
    const s = defineSettings({
      OUTER: t.template("Outer says: {INNER}"),
      INNER: t.template("Inner value is {VAL}"),
      VAL: t.constant(42),
    });
    expect(await s.OUTER.$resolve()).toBe("Outer says: Inner value is 42");
  });

  it("Func references a Template (deferred→deferred)", async () => {
    const s = defineSettings({
      COMPUTED: t.func(async ({ values }) => {
        const greeting = await values.GREETING.$resolve();
        return `Result: ${greeting}`;
      }),
      GREETING: t.template("Hello, {NAME}!"),
      NAME: t.string({ default: "World" }),
    });
    expect(await s.COMPUTED.$resolve()).toBe("Result: Hello, World!");
  });

  it("Template references a Func (deferred→deferred)", async () => {
    const s = defineSettings({
      TEMPLATE_REF: t.template("Func says: {FUNC_REF}"),
      FUNC_REF: t.func(({ values }) => `The value is ${values.NUM.$value()}`),
      NUM: t.number({ default: 99 }),
    });
    expect(await s.TEMPLATE_REF.$resolve()).toBe("Func says: The value is 99");
  });

  it("Template referencing non-existent key throws SchemaDefinitionError", async () => {
    const s = defineSettings({ URL: t.template("{MISSING}") });
    await expect(s.$load()).rejects.toThrow("Template reference not found: MISSING");
  });

  it("Template referencing non-existent nested key throws SchemaDefinitionError", async () => {
    const s = defineSettings({
      DATABASE: t.object({ HOST: t.string({ default: "localhost" }) }),
      URL: t.template("{DATABASE.MISSING}"),
    });
    await expect(s.$load()).rejects.toThrow("Template reference not found: DATABASE.MISSING");
  });
});

describe("cross-referencing deferred templates", () => {
  it("resolves templates that reference other deferred templates across passes", async () => {
    const s = defineSettings(
      { A: t.template("{C}"), B: t.template("{A}"), C: t.string() },
      { source: { C: "hello" } },
    );
    expect(await s.A.$resolve()).toBe("hello");
    expect(await s.B.$resolve()).toBe("hello");
  });

  it("reports unresolvable deferred entries in fallback loop", async () => {
    const s = defineSettings(
      { A: t.template("{C}"), B: t.template("{D}"), C: t.string() },
      { source: { C: "hello" } },
    );
    await expect(s.$load()).rejects.toThrow();
  });
});

describe("deferred field error paths", () => {
  it("MissingEnvError from Func", async () => {
    const s = defineSettings(
      {
        FN: t.func(() => {
          throw new MissingEnvError();
        }),
      },
      { source: { FN: "x" } },
    );
    await expect(s.$load()).rejects.toThrow(/FN/);
  });
  it("InvalidValueError from Func", async () => {
    const s = defineSettings(
      {
        FN: t.func(() => {
          throw InvalidValueError.forMessage("bad");
        }),
      },
      { source: { FN: "x" } },
    );
    await expect(s.$load()).rejects.toThrow(/bad/);
  });
  it("re-throws non-SettingsError from Func", async () => {
    const s = defineSettings(
      {
        FN: t.func(() => {
          throw new TypeError("unexpected");
        }),
      },
      { source: { FN: "x" } },
    );
    await expect(s.$load()).rejects.toThrow(TypeError);
  });
  it("masks InvalidValueError from secret-named deferred field", async () => {
    const s = defineSettings(
      {
        API_KEY: t.func(() => {
          throw InvalidValueError.forField("API_KEY", 'contains "secret-value"');
        }),
      },
      { source: { API_KEY: "x" } },
    );
    try {
      await s.$load();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SettingsValidationError);
      const err = (e as SettingsValidationError).errors[0];
      expect(err).toBeInstanceOf(InvalidValueError);
      expect(err.message).not.toContain("secret-value");
    }
  });
  it("masks short quoted value in secret-named error", async () => {
    const s = defineSettings(
      {
        API_KEY: t.func(() => {
          throw InvalidValueError.forField("API_KEY", 'contains "ab"');
        }),
      },
      { source: { API_KEY: "x" } },
    );
    try {
      await s.$load();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SettingsValidationError);
      const err = (e as SettingsValidationError).errors[0];
      expect(err).toBeInstanceOf(InvalidValueError);
      expect(err.message).not.toContain("ab");
    }
  });
});

describe("SchemaDefinitionError", () => {
  it("aggregates SchemaDefinitionError for missing template references", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({ URL: t.template("http://{MISSING_HOST}") });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors[0]).toBeInstanceOf(SchemaDefinitionError);
  });

  it("skips template resolution when Pass 1 has errors (prevents duplicate reporting)", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ key: "DB_HOST" }),
        URL: t.template("postgresql://{DATABASE.HOST}/mydb"),
      }),
    });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    // should contain MissingEnvError for HOST
    expect(caught?.errors.some((e) => e instanceof MissingEnvError)).toBe(true);
  });
});

describe("createResolveFn: envSource with undefined values", () => {
  it("skips undefined values in envSource when building src for sub-schema", async () => {
    const mockAdapter = {
      provider: "mock",
      fetch: async (_name: string) => ({
        value: JSON.stringify({ FIELD: "from-adapter" }),
        versionId: "v1",
      }),
    };

    const s = defineSettings(
      {
        SECRET: t.secret({
          adapter: mockAdapter,
          schema: { FIELD: t.string() },
        }),
      },
      {
        source: { SECRET: "my-secret", FIELD: undefined },
      },
    );

    const val = await (
      s.SECRET as unknown as { $resolve(): Promise<{ FIELD: string }> }
    ).$resolve();
    expect(val.FIELD).toBe("from-adapter");
  });
});

describe("createResolveFn: non-SettingsError re-throw", () => {
  it("re-throws non-SettingsError thrown during secret schema resolution", async () => {
    const { createTypeDef } = await import("../src/types/core.js");

    const badTypeDef = createTypeDef({
      _resolve: () => {
        throw new TypeError("unexpected internal error");
      },
    });

    const mockAdapter = {
      provider: "mock",
      fetch: async (_name: string) => ({
        value: JSON.stringify({ FIELD: "value" }),
      }),
    };

    const s = defineSettings(
      {
        SECRET: t.secret({
          adapter: mockAdapter,
          schema: { FIELD: badTypeDef },
        }),
      },
      { source: { SECRET: "my-secret-name" } },
    );

    await expect(s.SECRET.$resolve()).rejects.toThrow(TypeError);
  });
});

describe("createResolveFn: envPrefix empty (else branch)", () => {
  it("merges all keys from envSource into src when envPrefix is empty", async () => {
    const mockAdapter = {
      provider: "mock",
      fetch: async (_path: string) => ({
        value: JSON.stringify({ field: "default" }),
        versionId: "v1",
      }),
    };

    const s = defineSettings(
      {
        SECRET: t.secret({
          adapter: mockAdapter,
          schema: { field: t.string({ default: "from-schema" }) },
          key: "",
        }),
      },
      { source: { "": "my-secret", field: "from-env" } },
    );

    const val = await (
      s.SECRET as unknown as { $resolve(): Promise<{ field: string }> }
    ).$resolve();
    expect(typeof val.field).toBe("string");
  });

  it("skips undefined values in envSource", async () => {
    const mockAdapter = {
      provider: "mock",
      fetch: async (_path: string) => ({
        value: JSON.stringify({ field: "base-value" }),
        versionId: "v1",
      }),
    };

    const s = defineSettings(
      {
        SECRET: t.secret({
          adapter: mockAdapter,
          schema: { field: t.string({ default: "fallback" }) },
          key: "",
        }),
      },
      { source: { "": "my-secret", field: undefined } },
    );

    const val = await (
      s.SECRET as unknown as { $resolve(): Promise<{ field: string }> }
    ).$resolve();
    expect(val.field).toBe("base-value");
  });
});
