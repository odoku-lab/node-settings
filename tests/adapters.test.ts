import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { fields as f, loadSettings } from "../src/index.js";

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
});
afterEach(() => {
  process.env = originalEnv;
});

describe("f.ZodSchema", () => {
  it("resolves boolean values", () => {
    process.env.DEBUG = "true";
    const s = loadSettings({
      DEBUG: f.ZodSchema({ schema: z.coerce.boolean().default(false) }),
    });
    expect(s.DEBUG).toBe(true);
  });

  it("uses default value when field is not set", () => {
    const s = loadSettings({
      PORT: f.ZodSchema({ schema: z.coerce.number().default(3000) }),
    });
    expect(s.PORT).toBe(3000);
  });

  it("throws on missing required field", () => {
    expect(() => loadSettings({ VALUE: f.ZodSchema({ schema: z.string() }) })).toThrow();
  });

  it("throws on validation failure", () => {
    process.env.PORT = "not-a-number";
    expect(() => loadSettings({ PORT: f.ZodSchema({ schema: z.coerce.number() }) })).toThrow();
  });

  it("passes string().email() validation", () => {
    process.env.EMAIL = "test@example.com";
    const s = loadSettings({
      EMAIL: f.ZodSchema({ schema: z.string().email() }),
    });
    expect(s.EMAIL).toBe("test@example.com");
  });

  it("fails string().email() validation", () => {
    process.env.EMAIL = "not-an-email";
    expect(() => loadSettings({ EMAIL: f.ZodSchema({ schema: z.string().email() }) })).toThrow();
  });

  it("applies prefix", () => {
    process.env.APP_PORT = "9000";
    const s = loadSettings(
      { PORT: f.ZodSchema({ schema: z.coerce.number() }) },
      { prefix: "APP_" },
    );
    expect(s.PORT).toBe(9000);
  });

  it("overrides prefix with key { name, prefix }", () => {
    process.env.DB_PORT = "5432";
    const s = loadSettings(
      { PORT: f.ZodSchema({ key: { name: "DB_PORT", prefix: "" }, schema: z.coerce.number() }) },
      { prefix: "APP_" },
    );
    expect(s.PORT).toBe(5432);
  });

  it("returns undefined when optional and not set", () => {
    const s = loadSettings({
      OPT: f.ZodSchema({ schema: z.string(), optional: true }),
    });
    expect(s.OPT).toBeUndefined();
    expectTypeOf(s.OPT).toEqualTypeOf<string | undefined>();
  });
});

describe("f.ValibotSchema", () => {
  it("resolves a number", () => {
    process.env.PORT = "8080";
    const s = loadSettings({
      PORT: f.ValibotSchema({
        schema: v.pipe(v.string(), v.transform(Number), v.number()),
      }),
    });
    expect(s.PORT).toBe(8080);
  });

  it("uses fallback as default value", () => {
    const s = loadSettings({
      PORT: f.ValibotSchema({
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
    expect(s.PORT).toBe(3000);
  });

  it("throws on validation failure", () => {
    process.env.EMAIL = "not-an-email";
    expect(() =>
      loadSettings({
        EMAIL: f.ValibotSchema({ schema: v.pipe(v.string(), v.email()) }),
      }),
    ).toThrow();
  });

  it("returns undefined when optional and not set", () => {
    const s = loadSettings({
      OPT: f.ValibotSchema({ schema: v.string(), optional: true }),
    });
    expect(s.OPT).toBeUndefined();
    expectTypeOf(s.OPT).toEqualTypeOf<string | undefined>();
  });
});

describe("type inference", () => {
  it("infers output type from ZodSchema correctly", () => {
    process.env.NAME = "alice";
    const s = loadSettings({
      NAME: f.ZodSchema({ schema: z.string() }),
      PORT: f.ZodSchema({ schema: z.coerce.number().default(3000) }),
      FLAG: f.ZodSchema({ schema: z.coerce.boolean().default(false) }),
    });
    expectTypeOf(s.NAME).toEqualTypeOf<string>();
    expectTypeOf(s.PORT).toEqualTypeOf<number>();
    expectTypeOf(s.FLAG).toEqualTypeOf<boolean>();
  });

  it("infers output type from ValibotSchema correctly", () => {
    process.env.PORT = "9000";
    const s = loadSettings({
      PORT: f.ValibotSchema({
        schema: v.pipe(v.string(), v.transform(Number), v.number()),
      }),
    });
    expectTypeOf(s.PORT).toEqualTypeOf<number>();
  });
});
