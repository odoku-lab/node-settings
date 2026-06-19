import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsError } from "../../src/errors.js";

const azureGetMock = vi.fn();
vi.mock("@azure/keyvault-secrets", () => ({
  // biome-ignore lint/complexity/useArrowFunction: must be constructable with `new`
  SecretClient: vi.fn(function () {
    return { getSecret: azureGetMock };
  }),
}));
vi.mock("@azure/identity", () => ({ DefaultAzureCredential: vi.fn() }));

describe("AzureKeyVault adapter", () => {
  beforeEach(() => {
    azureGetMock.mockReset();
  });

  it("returns value and versionId on success", async () => {
    azureGetMock.mockResolvedValue({
      value: "azure-secret-value",
      properties: { version: "v2" },
    });

    const { AzureKeyVault } = await import("../../src/adapters/azure.js");
    const adapter = AzureKeyVault({ vaultUrl: "https://myvault.vault.azure.net" });
    const result = await adapter.fetch("my-secret");

    expect(result.value).toBe("azure-secret-value");
    expect(result.versionId).toBe("v2");
  });

  it("wraps SDK fetch error in SettingsError", async () => {
    azureGetMock.mockRejectedValue(new Error("Vault not found"));

    const { AzureKeyVault } = await import("../../src/adapters/azure.js");
    const adapter = AzureKeyVault({ vaultUrl: "https://myvault.vault.azure.net" });

    await expect(adapter.fetch("my-secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my-secret")).rejects.toThrow(
      'Azure Key Vault: failed to fetch "my-secret": Vault not found',
    );
  });

  it("uses provided credential directly without importing DefaultAzureCredential", async () => {
    azureGetMock.mockResolvedValue({
      value: "direct-cred-value",
      properties: { version: "v3" },
    });

    const mockCredential = { getToken: vi.fn() };
    const { AzureKeyVault } = await import("../../src/adapters/azure.js");
    const adapter = AzureKeyVault({
      vaultUrl: "https://myvault.vault.azure.net",
      credential: mockCredential,
    });
    const result = await adapter.fetch("my-secret");
    expect(result.value).toBe("direct-cred-value");
  });

  it("passes versionId as version option to getSecret", async () => {
    azureGetMock.mockResolvedValue({
      value: "versioned-value",
      properties: { version: "abc123" },
    });

    const { AzureKeyVault } = await import("../../src/adapters/azure.js");
    const adapter = AzureKeyVault({ vaultUrl: "https://myvault.vault.azure.net" });
    const result = await adapter.fetch("my-secret", { versionId: "abc123" });
    expect(result.value).toBe("versioned-value");
    expect(azureGetMock).toHaveBeenCalledWith("my-secret", { version: "abc123" });
  });
});
