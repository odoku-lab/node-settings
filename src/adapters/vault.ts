import { adapterFetch, importPeerDep } from "./shared.js";
import type { SecretAdapter } from "./types.js";

/**
 * HashiCorp Vault KV adapter.
 *
 * Supports both KV v1/v2 (static) and dynamic secrets with lease tracking.
 *
 * Requires the `node-vault` package:
 * ```bash
 * npm install node-vault
 * ```
 */
export function VaultKV(opts?: {
  endpoint?: string;
  token?: string;
  apiVersion?: string;
  namespace?: string;
  mountPath?: string;
  kvVersion?: 1 | 2;
}): SecretAdapter {
  const isV2 = opts?.kvVersion !== 1;
  return {
    provider: "vault",
    async fetch(name, options) {
      const vault = await importPeerDep(
        "node-vault",
        "Vault SDK is not installed. Run: npm install node-vault",
      );
      const defaultExport = vault.default as (opts: {
        endpoint?: string;
        token?: string;
        apiVersion?: string;
        namespace?: string;
      }) => {
        read: (path: string) => Promise<Record<string, unknown>>;
      };
      const client = defaultExport({
        endpoint: opts?.endpoint,
        token: opts?.token,
        apiVersion: opts?.apiVersion,
        namespace: opts?.namespace,
      });
      const mountPath = opts?.mountPath ?? "secret";
      const versionSuffix = isV2 && options?.versionId ? `?version=${options.versionId}` : "";
      const path = isV2 ? `${mountPath}/data/${name}${versionSuffix}` : `${mountPath}/${name}`;
      return adapterFetch("Vault", name, async () => {
        const res = await client.read(path);
        const rawData = res.data as Record<string, unknown>;
        const leaseDuration =
          typeof res.lease_duration === "number" ? res.lease_duration * 1000 : undefined;
        if (isV2) {
          const data = rawData.data as Record<string, unknown>;
          const metadata = rawData.metadata as Record<string, unknown> | undefined;
          return {
            value: JSON.stringify(data),
            versionId: typeof metadata?.version === "number" ? String(metadata.version) : undefined,
            leaseDuration,
          };
        }
        return { value: JSON.stringify(rawData), leaseDuration };
      });
    },
  };
}
