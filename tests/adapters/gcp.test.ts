import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsError } from "../../src/errors.js";

const gcpAccessMock = vi.fn();
const gcpGetProjectId = vi.fn().mockResolvedValue("test-project");
vi.mock("@google-cloud/secret-manager", () => ({
  // biome-ignore lint/complexity/useArrowFunction: must be constructable with `new`
  SecretManagerServiceClient: vi.fn(function () {
    return { accessSecretVersion: gcpAccessMock, getProjectId: gcpGetProjectId };
  }),
}));

describe("GCPSecretManager adapter", () => {
  beforeEach(() => {
    gcpAccessMock.mockReset();
    gcpGetProjectId.mockClear();
  });

  it("returns value and versionId on success", async () => {
    gcpAccessMock.mockResolvedValue([
      {
        name: "projects/p/secrets/my/secret/versions/3",
        payload: { data: Buffer.from('{"key":"value"}') },
      },
    ]);

    const { GCPSecretManager } = await import("../../src/adapters/gcp.js");
    const adapter = GCPSecretManager();
    const result = await adapter.fetch("my/secret");

    expect(result.value).toBe('{"key":"value"}');
    expect(result.versionId).toBe("3");
  });

  it("wraps SDK fetch error in SettingsError", async () => {
    gcpAccessMock.mockRejectedValue(new Error("Permission denied"));

    const { GCPSecretManager } = await import("../../src/adapters/gcp.js");
    const adapter = GCPSecretManager();

    await expect(adapter.fetch("my/secret")).rejects.toThrow(SettingsError);
    await expect(adapter.fetch("my/secret")).rejects.toThrow(
      'GCP Secret Manager: failed to fetch "my/secret": Permission denied',
    );
  });

  it("passes adapter options to SDK constructor", async () => {
    const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
    vi.mocked(SecretManagerServiceClient).mockClear();

    gcpAccessMock.mockResolvedValue([
      {
        name: "projects/p/secrets/my/secret/versions/3",
        payload: { data: Buffer.from('{"key":"value"}') },
      },
    ]);

    const { GCPSecretManager } = await import("../../src/adapters/gcp.js");
    const adapter = GCPSecretManager({
      projectId: "my-project",
      apiEndpoint: "https://custom.endpoint",
    });
    await adapter.fetch("my/secret");

    expect(vi.mocked(SecretManagerServiceClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "my-project",
        apiEndpoint: "https://custom.endpoint",
      }),
    );
  });

  it("filters undefined values from SDK options", async () => {
    const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
    vi.mocked(SecretManagerServiceClient).mockClear();

    gcpAccessMock.mockResolvedValue([
      {
        name: "projects/p/secrets/my/secret/versions/3",
        payload: { data: Buffer.from("val") },
      },
    ]);

    const { GCPSecretManager } = await import("../../src/adapters/gcp.js");
    const adapter = GCPSecretManager({ projectId: "my-project", credentials: undefined });
    await adapter.fetch("my/secret");

    expect(vi.mocked(SecretManagerServiceClient)).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "my-project" }),
    );
    expect(vi.mocked(SecretManagerServiceClient)).not.toHaveBeenCalledWith(
      expect.objectContaining({ credentials: undefined }),
    );
  });

  it("throws SettingsError when projectId cannot be resolved", async () => {
    gcpGetProjectId.mockResolvedValueOnce(null);

    gcpAccessMock.mockResolvedValue([
      {
        name: "projects/p/secrets/my/secret/versions/latest",
        payload: { data: Buffer.from("val") },
      },
    ]);

    const { GCPSecretManager } = await import("../../src/adapters/gcp.js");
    const adapter = GCPSecretManager();
    await expect(adapter.fetch("my/secret")).rejects.toThrow(
      "GCP Secret Manager: unable to resolve project ID",
    );
  });
});
