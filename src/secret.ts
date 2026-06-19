import type { SecretAdapter } from "./adapters/types.js";

const adapters = new Map<string, SecretAdapter>();

/**
 * Registers a SecretAdapter in the global registry.
 * Once registered, it can be referenced via `t.secret({ adapter: name })`.
 *
 * @param name - Name used to identify the adapter
 * @param adapter - SecretAdapter implementation to register
 */
export function registerAdapter(name: string, adapter: SecretAdapter): void {
  adapters.set(name, adapter);
}

/**
 * Retrieves a registered SecretAdapter by name.
 *
 * @param name - Name of the adapter to retrieve
 * @returns The SecretAdapter if registered, otherwise undefined
 */
export function getAdapter(name: string): SecretAdapter | undefined {
  return adapters.get(name);
}

/**
 * Checks whether an adapter with the given name is registered.
 *
 * @param name - Name of the adapter to check
 */
export function hasAdapter(name: string): boolean {
  return adapters.has(name);
}
