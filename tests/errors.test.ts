import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidValueError,
  MissingEnvError,
  SettingsError,
  SettingsValidationError,
} from "../src/errors.js";
import { defineSettings, types as t } from "../src/index.js";

const originalEnv = process.env;
beforeEach(async () => {
  process.env = { ...originalEnv };
});
afterEach(async () => {
  process.env = originalEnv;
});

describe("custom error classes", () => {
  it("MissingEnvError extends SettingsError", async () => {
    const err = new MissingEnvError("PORT");
    expect(err).toBeInstanceOf(SettingsError);
    expect(err).toBeInstanceOf(Error);
    expect(err.fieldName).toBe("PORT");
    expect(err.name).toBe("MissingEnvError");
  });

  it("InvalidValueError includes fieldName and reason in message", async () => {
    const err = InvalidValueError.forField("PORT", "not a number");
    expect(err).toBeInstanceOf(SettingsError);
    expect(err.fieldName).toBe("PORT");
    expect(err.message).toBe("Invalid value for PORT: not a number");
  });

  it("defineSettings rejects with SettingsValidationError containing MissingEnvError for missing required fields", async () => {
    let caught: unknown;
    const s = defineSettings({ REQUIRED: t.string() });
    try {
      await s.$load();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect((caught as SettingsValidationError).errors[0]).toBeInstanceOf(MissingEnvError);
  });
});

describe("error aggregation", () => {
  it("reports multiple missing fields together", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({ FOO: t.string(), BAR: t.number(), BAZ: t.boolean() });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors).toHaveLength(3);
    expect(caught?.errors.every((e) => e instanceof MissingEnvError)).toBe(true);
    expect(caught?.message).toContain("FOO");
    expect(caught?.message).toContain("BAR");
    expect(caught?.message).toContain("BAZ");
  });

  it("aggregates both missing and invalid values", async () => {
    process.env.BAD_NUM = "not-a-number";
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({ MISSING: t.string(), BAD_NUM: t.number() });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught?.errors).toHaveLength(2);
    const kinds = caught?.errors.map((e) => e.constructor.name).sort();
    expect(kinds).toEqual(["InvalidValueError", "MissingEnvError"]);
  });

  it("aggregates errors from nested groups", async () => {
    let caught: SettingsValidationError | undefined;
    const s = defineSettings({
      DATABASE: t.object({
        HOST: t.string({ key: "DB_HOST" }),
        PORT: t.number({ key: "DB_PORT" }),
      }),
    });
    try {
      await s.$load();
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught?.errors).toHaveLength(2);
  });
});
