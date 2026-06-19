import { adapterFetch, importPeerDep } from "./shared.js";
import type { SecretAdapter } from "./types.js";

/**
 * Azure Key Vault adapter.
 *
 * Requires the `@azure/keyvault-secrets` and `@azure/identity` packages:
 * ```bash
 * npm install @azure/keyvault-secrets @azure/identity
 * ```
 */
export function AzureKeyVault(opts: {
  vaultUrl: string;
  credential?: unknown;
  apiVersion?: string;
  tenantId?: string;
  managedIdentityClientId?: string;
}): SecretAdapter {
  // Credential initialization Promise executed only once on first fetch (prevents race conditions)
  let credentialPromise: Promise<unknown> | undefined;

  async function resolveCredential(): Promise<unknown> {
    if (opts.credential) return opts.credential;
    const { DefaultAzureCredential } = await importPeerDep<{
      DefaultAzureCredential: new (options?: {
        tenantId?: string;
        managedIdentityClientId?: string;
      }) => unknown;
    }>(
      "@azure/identity",
      "Azure SDK is not installed. Run: npm install @azure/keyvault-secrets @azure/identity",
    );
    return new DefaultAzureCredential({
      tenantId: opts.tenantId,
      managedIdentityClientId: opts.managedIdentityClientId,
    });
  }

  return {
    provider: "azure",
    async fetch(name, options) {
      credentialPromise ??= resolveCredential();
      const credential = await credentialPromise;

      const { SecretClient } = await importPeerDep<{
        SecretClient: new (
          url: string,
          credential: unknown,
          options?: { apiVersion?: string },
        ) => {
          getSecret: (
            name: string,
            options?: { version?: string },
          ) => Promise<{ value: string; properties: { version: string } }>;
        };
      }>(
        "@azure/keyvault-secrets",
        "Azure SDK is not installed. Run: npm install @azure/keyvault-secrets @azure/identity",
      );
      const client = new SecretClient(opts.vaultUrl, credential, {
        apiVersion: opts.apiVersion,
      });
      return adapterFetch("Azure Key Vault", name, async () => {
        const secret = await client.getSecret(
          name,
          options?.versionId ? { version: options.versionId } : undefined,
        );
        return {
          value: secret.value,
          versionId: secret.properties.version,
        };
      });
    },
  };
}
