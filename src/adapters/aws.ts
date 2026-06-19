import { SettingsError } from "../errors.js";
import { adapterFetch, importPeerDep } from "./shared.js";
import type { SecretAdapter } from "./types.js";

/**
 * AWS Secrets Manager adapter.
 *
 * Requires the `@aws-sdk/client-secrets-manager` package:
 * ```bash
 * npm install @aws-sdk/client-secrets-manager
 * ```
 */
export function AWSSecretsManager(opts?: {
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  maxAttempts?: number;
  retryMode?: string;
}): SecretAdapter {
  return {
    provider: "aws",
    async fetch(name, options) {
      const { SecretsManagerClient, GetSecretValueCommand } = await importPeerDep<{
        SecretsManagerClient: new (opts?: {
          region?: string;
          endpoint?: string;
          credentials?: Record<string, string | undefined>;
          maxAttempts?: number;
          retryMode?: string;
        }) => {
          send: (
            cmd: unknown,
          ) => Promise<{ SecretString?: string; SecretBinary?: Buffer; VersionId?: string }>;
        };
        GetSecretValueCommand: new (opts: { SecretId: string; VersionId?: string }) => unknown;
      }>(
        "@aws-sdk/client-secrets-manager",
        "AWS SDK is not installed. Run: npm install @aws-sdk/client-secrets-manager",
      );
      const client = new SecretsManagerClient(opts);
      return adapterFetch("AWS Secrets Manager", name, async () => {
        const cmd = new GetSecretValueCommand({
          SecretId: name,
          ...(options?.versionId && { VersionId: options.versionId }),
        });
        const res = await client.send(cmd);
        const secretValue = res.SecretString ?? res.SecretBinary;
        if (!secretValue) {
          throw new SettingsError(`AWS Secrets Manager: secret "${name}" returned no value`);
        }
        const value =
          typeof secretValue === "string" ? secretValue : Buffer.from(secretValue).toString();
        return { value, versionId: res.VersionId };
      });
    },
  };
}
