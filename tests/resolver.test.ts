import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../src/resolver.js";

describe("resolveTemplate", () => {
  const resolved = {
    DATABASE: {
      HOST: "localhost",
      PORT: 5432,
      USER: "admin",
      PASSWORD: "secret",
      DB_NAME: "mydb",
    },
    APP_NAME: "myapp",
  };

  it("replaces a single placeholder", () => {
    expect(resolveTemplate("{APP_NAME}", resolved)).toBe("myapp");
  });

  it("replaces a nested placeholder", () => {
    expect(resolveTemplate("{DATABASE.HOST}", resolved)).toBe("localhost");
  });

  it("replaces multiple placeholders", () => {
    expect(
      resolveTemplate(
        "postgresql://{DATABASE.USER}:{DATABASE.PASSWORD}@{DATABASE.HOST}:{DATABASE.PORT}/{DATABASE.DB_NAME}",
        resolved,
      ),
    ).toBe("postgresql://admin:secret@localhost:5432/mydb");
  });

  it("returns the string as-is when no placeholders are found", () => {
    expect(resolveTemplate("no-placeholders", resolved)).toBe("no-placeholders");
  });

  it("throws on missing key", () => {
    expect(() => resolveTemplate("{MISSING}", resolved)).toThrow(
      "Template reference not found: MISSING",
    );
  });

  it("throws on missing nested key", () => {
    expect(() => resolveTemplate("{DATABASE.MISSING}", resolved)).toThrow(
      "Template reference not found: DATABASE.MISSING",
    );
  });
});
