import { SettingsError } from "../errors.js";

/** Dynamically import an optional peer dependency, throwing a helpful message on failure. */
export async function importPeerDep<T = Record<string, unknown>>(
  pkg: string,
  installHint: string,
): Promise<T> {
  try {
    return (await import(pkg)) as T;
  } catch {
    throw new SettingsError(installHint);
  }
}

/** Wraps an adapter fetch operation in a shared try-catch, throwing a SettingsError on failure. */
export async function adapterFetch<T>(
  provider: string,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : globalThis.String(err);
    const error = new SettingsError(`${provider}: failed to fetch "${name}": ${msg}`);
    if (err instanceof Error) error.cause = err;
    throw error;
  }
}
