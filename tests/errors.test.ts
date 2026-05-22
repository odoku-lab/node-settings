import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InvalidValueError,
  MissingEnvError,
  SchemaDefinitionError,
  SettingsError,
} from "../src/errors.js";
import { fields as f, loadSettings, SettingsValidationError } from "../src/index.js";

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
});
afterEach(() => {
  process.env = originalEnv;
});

describe("custom error classes", () => {
  it("MissingEnvError extends SettingsError", () => {
    const err = new MissingEnvError("PORT");
    expect(err).toBeInstanceOf(SettingsError);
    expect(err).toBeInstanceOf(Error);
    expect(err.fieldName).toBe("PORT");
    expect(err.name).toBe("MissingEnvError");
  });

  it("InvalidValueError includes fieldName and reason in message", () => {
    const err = new InvalidValueError("PORT", "not a number");
    expect(err).toBeInstanceOf(SettingsError);
    expect(err.fieldName).toBe("PORT");
    expect(err.message).toBe("Invalid value for PORT: not a number");
  });

  it("loadSettings throws SettingsValidationError for missing required fields", () => {
    expect(() => loadSettings({ REQUIRED: f.String() })).toThrow(SettingsValidationError);
  });
});

describe("error aggregation", () => {
  it("reports multiple missing fields together", () => {
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({ FOO: f.String(), BAR: f.Number(), BAZ: f.Boolean() });
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

  it("aggregates both missing and invalid values", () => {
    process.env.BAD_NUM = "not-a-number";
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({ MISSING: f.String(), BAD_NUM: f.Number() });
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught?.errors).toHaveLength(2);
    const kinds = caught?.errors.map((e) => e.constructor.name).sort();
    expect(kinds).toEqual(["InvalidValueError", "MissingEnvError"]);
  });

  it("aggregates errors from nested groups", () => {
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({
        DATABASE: {
          HOST: f.String({ key: { name: "DB_HOST", prefix: "" } }),
          PORT: f.Number({ key: { name: "DB_PORT", prefix: "" } }),
        },
      });
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught?.errors).toHaveLength(2);
  });
});

describe("f.ZodSchema errors use logical field name", () => {
  it("error includes the logical name PORT not the prefixed env key", () => {
    process.env.APP_PORT = "not-a-number";
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({ PORT: f.ZodSchema({ schema: z.coerce.number().int() }) }, { prefix: "APP_" });
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    const err = caught?.errors[0] as InvalidValueError;
    expect(err).toBeInstanceOf(InvalidValueError);
    expect(err.fieldName).toBe("PORT");
  });
});

describe("SchemaDefinitionError", () => {
  it("aggregates SchemaDefinitionError for missing template references", () => {
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({ URL: f.Template("http://{MISSING_HOST}") });
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect(caught?.errors[0]).toBeInstanceOf(SchemaDefinitionError);
  });

  it("skips template resolution when Pass 1 has errors (prevents duplicate reporting)", () => {
    let caught: SettingsValidationError | undefined;
    try {
      loadSettings({
        DATABASE: {
          HOST: f.String({ key: { name: "DB_HOST", prefix: "" } }),
          URL: f.Template("postgresql://{DATABASE.HOST}/mydb"),
        },
      });
    } catch (e) {
      caught = e as SettingsValidationError;
    }
    // Only MissingEnvError(DB_HOST) — no duplicate SchemaDefinitionError for template
    expect(caught?.errors).toHaveLength(1);
    expect(caught?.errors[0]).toBeInstanceOf(MissingEnvError);
  });
});

describe("envFile does not pollute process.env", () => {
  it("envFile-sourced variables do not remain in process.env after loadSettings", () => {
    const envPath = join(tmpdir(), `settings-pollution-${Date.now()}.env`);
    writeFileSync(envPath, "APP_NO_LEAK=from-file\n");
    try {
      const s = loadSettings({ NO_LEAK: f.String() }, { prefix: "APP_", envFile: envPath });
      expect(s.NO_LEAK).toBe("from-file");
      expect(process.env.APP_NO_LEAK).toBeUndefined();
    } finally {
      unlinkSync(envPath);
    }
  });
});
