/** A single resolved secret value from an adapter. */
export interface SecretValue {
  /** The secret payload as a string (JSON or plain text). */
  value: string;
  /** Provider-specific version identifier for rotation detection. */
  versionId?: string;
  /** Lease duration in milliseconds (Vault dynamic secrets). */
  leaseDuration?: number;
}

/**
 * Pluggable secret adapter interface.
 * Each cloud provider (AWS, GCP, Azure, Vault) implements this interface.
 */
export interface SecretAdapter {
  /** Human-readable provider name (e.g. "aws", "gcp", "azure", "vault"). */
  readonly provider: string;
  /** Fetch a secret by name. */
  fetch(name: string, options?: { versionId?: string }): Promise<SecretValue>;
}
