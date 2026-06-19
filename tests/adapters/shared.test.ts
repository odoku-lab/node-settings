import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsError } from "../../src/errors.js";

/**
 * Tests for the "SDK not installed" error path.
 *
 * Mocks importPeerDep to throw so we can test the error path regardless
 * of whether the optional peer dep packages are installed locally.
 */

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AWSSecretsManager: SDK not installed", () => {
  beforeEach(async () => {
    vi.doMock("../../src/adapters/shared.js", async () => {
      const mod = await vi.importActual("../../src/adapters/shared.js");
      return {
        ...(mod as Record<string, unknown>),
        importPeerDep: async (_pkg: string, hint: string) => {
          throw new SettingsError(hint);
        },
      };
    });
  });

  it("throws SettingsError when @aws-sdk/client-secrets-manager is missing", async () => {
    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager();
    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow("AWS SDK is not installed");
  });
});

describe("GCPSecretManager: SDK not installed", () => {
  beforeEach(async () => {
    vi.doMock("../../src/adapters/shared.js", async () => {
      const mod = await vi.importActual("../../src/adapters/shared.js");
      return {
        ...(mod as Record<string, unknown>),
        importPeerDep: async (_pkg: string, hint: string) => {
          throw new SettingsError(hint);
        },
      };
    });
  });

  it("throws SettingsError when @google-cloud/secret-manager is missing", async () => {
    const { GCPSecretManager } = await import("../../src/adapters/gcp.js");
    const adapter = GCPSecretManager();
    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow(
      "GCP Secret Manager SDK is not installed",
    );
  });
});

describe("AzureKeyVault: SDK not installed", () => {
  beforeEach(async () => {
    vi.doMock("../../src/adapters/shared.js", async () => {
      const mod = await vi.importActual("../../src/adapters/shared.js");
      return {
        ...(mod as Record<string, unknown>),
        importPeerDep: async (_pkg: string, hint: string) => {
          throw new SettingsError(hint);
        },
      };
    });
  });

  it("throws SettingsError when @azure/keyvault-secrets is missing", async () => {
    const { AzureKeyVault } = await import("../../src/adapters/azure.js");
    const adapter = AzureKeyVault({ vaultUrl: "https://myvault.vault.azure.net" });
    await expect(adapter.fetch("my-secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my-secret")).rejects.toThrow("Azure SDK is not installed");
  });
});

describe("importPeerDep", () => {
  it("throws SettingsError for non-existent packages", async () => {
    const { importPeerDep } = (await vi.importActual("../../src/adapters/shared.js")) as {
      importPeerDep: (pkg: string, hint: string) => Promise<Record<string, unknown>>;
    };
    await expect(importPeerDep("non-existent-pkg-12345", "custom hint")).rejects.toThrow(
      "custom hint",
    );
  });
});

describe("adapterFetch: non-Error thrown", () => {
  it("wraps a non-Error throw (string) in SettingsError", async () => {
    const { adapterFetch } = (await vi.importActual("../../src/adapters/shared.js")) as {
      adapterFetch: <T>(provider: string, name: string, fn: () => Promise<T>) => Promise<T>;
    };
    await expect(
      adapterFetch("TestProvider", "my-secret", async () => {
        throw "plain string error";
      }),
    ).rejects.toThrow(SettingsError);
  });
});

describe("VaultKV: SDK not installed", () => {
  beforeEach(async () => {
    vi.doMock("../../src/adapters/shared.js", async () => {
      const mod = await vi.importActual("../../src/adapters/shared.js");
      return {
        ...(mod as Record<string, unknown>),
        importPeerDep: async (_pkg: string, hint: string) => {
          throw new SettingsError(hint);
        },
      };
    });
  });

  it("throws SettingsError when node-vault is missing", async () => {
    const { VaultKV } = await import("../../src/adapters/vault.js");
    const adapter = VaultKV();
    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow("Vault SDK is not installed");
  });
});
