import { SettingsError } from "../errors.js";
import { adapterFetch, importPeerDep } from "./shared.js";
import type { SecretAdapter } from "./types.js";

/**
 * GCP Secret Manager adapter.
 *
 * Requires the `@google-cloud/secret-manager` package:
 * ```bash
 * npm install @google-cloud/secret-manager
 * ```
 */
export function GCPSecretManager(opts?: {
  projectId?: string;
  apiEndpoint?: string;
  credentials?: { client_email: string; private_key: string };
}): SecretAdapter {
  return {
    provider: "gcp",
    async fetch(name, options) {
      const { SecretManagerServiceClient } = await importPeerDep<{
        SecretManagerServiceClient: new (
          opts?: Record<string, unknown>,
        ) => {
          getProjectId: () => Promise<string>;
          accessSecretVersion: (opts: {
            name: string;
          }) => Promise<Array<{ name?: string; payload: { data: Buffer } }>>;
        };
      }>(
        "@google-cloud/secret-manager",
        "GCP Secret Manager SDK is not installed. Run: npm install @google-cloud/secret-manager",
      );
      const sdkOpts = opts
        ? Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined))
        : undefined;
      const client = new SecretManagerServiceClient(sdkOpts);
      const projectId = opts?.projectId ?? (await client.getProjectId());
      if (!projectId) {
        throw new SettingsError("GCP Secret Manager: unable to resolve project ID");
      }
      const versionSegment = options?.versionId ?? "latest";
      return adapterFetch("GCP Secret Manager", name, async () => {
        const [version] = await client.accessSecretVersion({
          name: `projects/${projectId}/secrets/${name}/versions/${versionSegment}`,
        });
        return {
          value: version.payload.data.toString(),
          versionId: version.name?.split("/").pop(),
        };
      });
    },
  };
}
