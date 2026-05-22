import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEnvSource } from "../src/loader.js";

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
});
afterEach(() => {
  process.env = originalEnv;
});

describe("buildEnvSource", () => {
  it("returns process.env when envFile is not specified", () => {
    process.env.TEST_KEY = "test-value";
    const env = buildEnvSource(undefined);
    expect(env.TEST_KEY).toBe("test-value");
    expect(env).toBe(process.env);
  });

  it("reads keys and values from envFile", () => {
    const envPath = join(tmpdir(), `loader-test-${Date.now()}.env`);
    writeFileSync(envPath, "LOADER_KEY=from-file\n");
    try {
      const env = buildEnvSource(envPath);
      expect(env.LOADER_KEY).toBe("from-file");
    } finally {
      unlinkSync(envPath);
    }
  });

  it("envFile values are weaker than process.env (process.env takes priority)", () => {
    const envPath = join(tmpdir(), `loader-test-${Date.now()}.env`);
    writeFileSync(envPath, "PRIORITY_KEY=from-file\n");
    process.env.PRIORITY_KEY = "from-process";
    try {
      const env = buildEnvSource(envPath);
      expect(env.PRIORITY_KEY).toBe("from-process");
    } finally {
      unlinkSync(envPath);
      delete process.env.PRIORITY_KEY;
    }
  });

  it("does not pollute process.env when loading envFile", () => {
    const envPath = join(tmpdir(), `loader-test-${Date.now()}.env`);
    writeFileSync(envPath, "NO_LEAK_KEY=leaked\n");
    try {
      buildEnvSource(envPath);
      expect(process.env.NO_LEAK_KEY).toBeUndefined();
    } finally {
      unlinkSync(envPath);
    }
  });

  it("does not throw when envFile does not exist", () => {
    expect(() => buildEnvSource("/nonexistent/path/.env")).not.toThrow();
  });
});
