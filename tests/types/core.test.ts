import { describe, expect, it } from "vitest";

describe("isType", () => {
  it("returns true for TypeDef values", async () => {
    const { isType } = await import("../../src/types/core.js");
    const { stringType } = await import("../../src/types/factories.js");
    expect(isType(stringType())).toBe(true);
    expect(isType(stringType({ optional: true }))).toBe(true);
  });

  it("returns false for non-TypeDef values", async () => {
    const { isType } = await import("../../src/types/core.js");
    expect(isType(null)).toBe(false);
    expect(isType(undefined)).toBe(false);
    expect(isType("string")).toBe(false);
    expect(isType(42)).toBe(false);
    expect(isType({})).toBe(false);
    expect(isType({ key: "value" })).toBe(false);
  });
});

describe("resolveKeys", () => {
  it("uses schemaKey with defaultPrefix when key and prefix are not set", async () => {
    const { resolveKeys } = await import("../../src/types/core.js");
    const r = resolveKeys({}, "MY_KEY", "PREFIX_");
    expect(r.envKey).toBe("PREFIX_MY_KEY");
    expect(r.fieldName).toBe("MY_KEY");
  });

  it("uses key directly and ignores defaultPrefix when key is set", async () => {
    const { resolveKeys } = await import("../../src/types/core.js");
    const r = resolveKeys({ key: "CUSTOM" }, "MY_KEY", "PREFIX_");
    expect(r.envKey).toBe("CUSTOM");
    expect(r.fieldName).toBe("CUSTOM");
  });

  it("uses key directly and ignores prefix when both key and prefix are set", async () => {
    const { resolveKeys } = await import("../../src/types/core.js");
    const r = resolveKeys({ key: "X_VALUE", prefix: "APP_" }, "MY_KEY", "PREFIX_");
    expect(r.envKey).toBe("X_VALUE");
    expect(r.fieldName).toBe("X_VALUE");
  });

  it("uses prefix + schemaKey when only prefix is set", async () => {
    const { resolveKeys } = await import("../../src/types/core.js");
    const r = resolveKeys({ prefix: "APP_" }, "MY_KEY", "PREFIX_");
    expect(r.envKey).toBe("APP_MY_KEY");
    expect(r.fieldName).toBe("MY_KEY");
  });
});
