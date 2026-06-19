import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsError } from "../../src/errors.js";

const vaultMocks = vi.hoisted(() => {
  const read = vi.fn();
  const factory = vi.fn(() => ({ read }));
  return { read, factory };
});

vi.mock("node-vault", () => ({
  default: vaultMocks.factory,
}));

describe("VaultKV adapter", () => {
  beforeEach(() => {
    vaultMocks.read.mockReset();
    vaultMocks.factory.mockClear();
  });

  it("returns value with lease_duration (KV v2)", async () => {
    vaultMocks.read.mockResolvedValue({
      data: { data: { key: "value" }, metadata: { version: 5 } },
      lease_duration: 3600,
    });

    const { VaultKV } = await import("../../src/adapters/vault.js");
    const adapter = VaultKV();
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe(JSON.stringify({ key: "value" }));
    expect(result.versionId).toBe("5");
    expect(result.leaseDuration).toBe(3_600_000);
  });

  it("supports KV v1 without lease", async () => {
    vaultMocks.read.mockResolvedValue({
      data: { key: "value" },
    });

    const { VaultKV } = await import("../../src/adapters/vault.js");
    const adapter = VaultKV({ kvVersion: 1 });
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe(JSON.stringify({ key: "value" }));
    expect(result.versionId).toBeUndefined();
    expect(result.leaseDuration).toBeUndefined();
  });

  it("supports KV v2 with versionId option", async () => {
    vaultMocks.read.mockResolvedValue({
      data: { data: { key: "versioned" }, metadata: { version: 3 } },
      lease_duration: 0,
    });

    const { VaultKV } = await import("../../src/adapters/vault.js");
    const adapter = VaultKV();
    const result = await adapter.fetch("my/secret", { versionId: "3" });

    expect(result.value).toBe(JSON.stringify({ key: "versioned" }));
    expect(result.versionId).toBe("3");
  });

  it("handles non-numeric metadata version (returns undefined versionId)", async () => {
    vaultMocks.read.mockResolvedValue({
      data: { data: { key: "val" }, metadata: { version: "string-version" } },
    });

    const { VaultKV } = await import("../../src/adapters/vault.js");
    const adapter = VaultKV();
    const result = await adapter.fetch("my/secret");

    expect(result.versionId).toBeUndefined();
  });

  it("wraps SDK fetch error in SettingsError", async () => {
    vaultMocks.read.mockRejectedValue(new Error("Connection refused"));

    const { VaultKV } = await import("../../src/adapters/vault.js");
    const adapter = VaultKV();

    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow(
      'Vault: failed to fetch "my/secret": Connection refused',
    );
  });
});
