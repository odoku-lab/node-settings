import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsError } from "../../src/errors.js";

const awsSendMock = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  // biome-ignore lint/complexity/useArrowFunction: must be constructable (new)
  SecretsManagerClient: vi.fn(function () {
    return { send: awsSendMock };
  }),
  GetSecretValueCommand: vi.fn(),
}));

describe("AWSSecretsManager adapter", () => {
  beforeEach(() => {
    awsSendMock.mockReset();
  });

  it("returns value and versionId on success", async () => {
    awsSendMock.mockResolvedValue({
      SecretString: '{"key":"value"}',
      VersionId: "v1",
    });

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager();
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe('{"key":"value"}');
    expect(result.versionId).toBe("v1");
    expect(awsSendMock).toHaveBeenCalledTimes(1);
  });

  it("handles binary secrets", async () => {
    awsSendMock.mockResolvedValue({
      SecretBinary: Buffer.from("binary-value"),
    });

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager();
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe("binary-value");
  });

  it("throws SettingsError when neither SecretString nor SecretBinary is present", async () => {
    awsSendMock.mockResolvedValue({ VersionId: "v1" });

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager();

    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow(
      'AWS Secrets Manager: failed to fetch "my/secret": AWS Secrets Manager: secret "my/secret" returned no value',
    );
  });

  it("wraps SDK fetch error in SettingsError", async () => {
    awsSendMock.mockRejectedValue(new Error("Access denied"));

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager();

    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow(
      'AWS Secrets Manager: failed to fetch "my/secret": Access denied',
    );
  });

  it("passes options to constructor", async () => {
    awsSendMock.mockResolvedValue({ SecretString: "val", VersionId: "v1" });

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager({ region: "us-east-1", maxAttempts: 3 });
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe("val");
    expect(result.versionId).toBe("v1");
  });

  it("passes options without region", async () => {
    awsSendMock.mockResolvedValue({ SecretString: "val" });

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager({ maxAttempts: 3 });
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe("val");
  });

  it("passes versionId option to GetSecretValueCommand", async () => {
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    awsSendMock.mockResolvedValue({ SecretString: "versioned-val", VersionId: "abc" });

    const { AWSSecretsManager } = await import("../../src/adapters/aws.js");
    const adapter = AWSSecretsManager();
    const result = await adapter.fetch("my/secret", { versionId: "abc" });

    expect(result.value).toBe("versioned-val");
    expect(vi.mocked(GetSecretValueCommand)).toHaveBeenCalledWith(
      expect.objectContaining({ VersionId: "abc" }),
    );
  });
});
