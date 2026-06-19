import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  defineSettings,
  InvalidValueError,
  type SettingsValidationError,
  types as t,
} from "../../src/index.js";

const originalEnv = process.env;
beforeEach(async () => {
  process.env = { ...originalEnv };
});
afterEach(async () => {
  process.env = originalEnv;
});

describe("t.ZodSchema", () => {
  it("resolves boolean values", async () => {
    process.env.DEBUG = "true";
    const s = defineSettings({
      DEBUG: t.zodSchema({ schema: z.coerce.boolean().default(false) }),
    });
    expect(await s.DEBUG.$value()).toBe(true);
  });

  it("uses default value when field is not set", async () => {
    const s = defineSettings({
      PORT: t.zodSchema({ schema: z.coerce.number().default(3000) }),
    });
    expect(await s.PORT.$value()).toBe(3000);
  });

  it("throws on missing required field", async () => {
    const s = defineSettings({ VALUE: t.zodSchema({ schema: z.string() }) });
    await expect(s.$load()).rejects.toThrow();
  });

  it("throws on validation failure", async () => {
    process.env.PORT = "not-a-number";
    const s = defineSettings({ PORT: t.zodSchema({ schema: z.coerce.number() }) });
    await expect(s.$load()).rejects.toThrow();
  });

  it("passes string().email() validation", async () => {
    process.env.EMAIL = "test@example.com";
    const s = defineSettings({
      EMAIL: t.zodSchema({ schema: z.string().email() }),
    });
    expect(await s.EMAIL.$value()).toBe("test@example.com");
  });

  it("fails string().email() validation", async () => {
    process.env.EMAIL = "not-an-email";
    const s = defineSettings({ EMAIL: t.zodSchema({ schema: z.string().email() }) });
    await expect(s.$load()).rejects.toThrow();
  });

  it("applies prefix", async () => {
    process.env.APP_PORT = "9000";
    const s = defineSettings(
      { PORT: t.zodSchema({ schema: z.coerce.number() }) },
      { prefix: "APP_" },
    );
    expect(await s.PORT.$value()).toBe(9000);
  });

  it("overrides prefix with key { name, prefix }", async () => {
    process.env.DB_PORT = "5432";
    const s = defineSettings(
      { PORT: t.zodSchema({ key: "DB_PORT", schema: z.coerce.number() }) },
      { prefix: "APP_" },
    );
    expect(await s.PORT.$value()).toBe(5432);
  });

  it("returns undefined when optional and not set", async () => {
    const s = defineSettings({
      OPT: t.zodSchema({ schema: z.string(), optional: true }),
    });
    expect(await s.OPT.$value()).toBeUndefined();
    expectTypeOf(await s.OPT.$value()).toEqualTypeOf<string | undefined>();
  });

  it("error includes the logical name PORT not the prefixed env key", async () => {
    process.env.APP_PORT = "not-a-number";
    let caught: SettingsValidationError | undefined;
    const s = defineSettings(
      { PORT: t.zodSchema({ schema: z.coerce.number().int() }) },
      { prefix: "APP_" },
    );
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    const err = caught?.errors[0] as InvalidValueError;
    expect(err).toBeInstanceOf(InvalidValueError);
    expect(err.fieldName).toBe("PORT");
  });

  it("wraps non-Error throw from parse", async () => {
    const s = defineSettings(
      {
        X: t.zodSchema({
          schema: {
            parse: () => {
              throw "oops";
            },
          },
        }),
      },
      { source: { X: "hello" } },
    );
    await expect(s.$load()).rejects.toThrow(/oops/);
  });
});

describe("t.ValibotSchema", () => {
  it("resolves a number", async () => {
    process.env.PORT = "8080";
    const s = defineSettings({
      PORT: t.valibotSchema({
        schema: v.pipe(v.string(), v.transform(Number), v.number()),
      }),
    });
    expect(await s.PORT.$value()).toBe(8080);
  });

  it("uses fallback as default value", async () => {
    const s = defineSettings({
      PORT: t.valibotSchema({
        schema: v.fallback(
          v.pipe(
            v.string(),
            v.transform((s) => Number(s)),
            v.number(),
          ),
          3000,
        ),
      }),
    });
    expect(await s.PORT.$value()).toBe(3000);
  });

  it("throws on validation failure", async () => {
    process.env.EMAIL = "not-an-email";
    const s = defineSettings({ EMAIL: t.valibotSchema({ schema: v.pipe(v.string(), v.email()) }) });
    await expect(s.$load()).rejects.toThrow();
  });

  it("returns undefined when optional and not set", async () => {
    const s = defineSettings({
      OPT: t.valibotSchema({ schema: v.string(), optional: true }),
    });
    expect(await s.OPT.$value()).toBeUndefined();
    expectTypeOf(await s.OPT.$value()).toEqualTypeOf<string | undefined>();
  });

  it("throws on non-standard schema", async () => {
    const s = defineSettings({ X: t.valibotSchema({ schema: {} }) }, { source: { X: "hello" } });
    await expect(s.$load()).rejects.toThrow(/does not implement Standard Schema interface/);
  });

  it("throws on async valibot schema", async () => {
    const s = defineSettings(
      {
        X: t.valibotSchema({
          schema: {
            "~standard": {
              version: 1,
              vendor: "valibot",
              validate: () => Promise.resolve({ value: "ok" }),
            },
          },
        }),
      },
      { source: { X: "hello" } },
    );
    await expect(s.$load()).rejects.toThrow(/async schemas are not supported/);
  });

  it("wraps non-Error throw from ValibotSchema", async () => {
    const s = defineSettings(
      {
        X: t.valibotSchema({
          schema: {
            "~standard": {
              version: 1,
              vendor: "test",
              validate: () => {
                throw "string error";
              },
            },
          },
        }),
      },
      { source: { X: "hello" } },
    );
    await expect(s.$load()).rejects.toThrow(/string error/);
  });
});

describe("type inference", () => {
  it("infers output type from ZodSchema correctly", async () => {
    process.env.NAME = "alice";
    const s = defineSettings({
      NAME: t.zodSchema({ schema: z.string() }),
      PORT: t.zodSchema({ schema: z.coerce.number().default(3000) }),
      FLAG: t.zodSchema({ schema: z.coerce.boolean().default(false) }),
    });
    expectTypeOf(await s.NAME.$value()).toEqualTypeOf<string>();
    expectTypeOf(await s.PORT.$value()).toEqualTypeOf<number>();
    expectTypeOf(await s.FLAG.$value()).toEqualTypeOf<boolean>();
  });

  it("infers output type from ValibotSchema correctly", async () => {
    process.env.PORT = "9000";
    const s = defineSettings({
      PORT: t.valibotSchema({
        schema: v.pipe(v.string(), v.transform(Number), v.number()),
      }),
    });
    expectTypeOf(await s.PORT.$value()).toEqualTypeOf<number>();
  });
});
