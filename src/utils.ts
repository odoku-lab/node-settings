/** Converts a camelCase or PascalCase string to UPPER_SNAKE_CASE. */
export function toConstantCase(str: string): string {
  return str
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

/** Type guard that checks whether a value is a plain object with no prototype. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
  );
}

/** Regex pattern for detecting field names related to secrets. */
export const SECRET_PATTERN = /secret|password|passwd|token|api[_-]?key|auth|credential/i;

/**
 * Attempts to parse a JSON string.
 * Returns the original string as-is if parsing fails.
 */
export function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Masks double-quoted values in error messages.
 * Values of 4 characters or fewer are replaced with the first character + `***`;
 * values of 5 or more characters are replaced with the first 3 characters + `***` + the last 4 characters.
 * Used to prevent secret values from leaking into logs.
 */
export function maskQuotedValues(msg: string): string {
  return msg.replace(/"([^"]+)"/g, (_, val: string) => {
    if (val.length <= 4) return `"${val[0]}***"`;
    return `"${val.slice(0, 3)}***${val.slice(-4)}"`;
  });
}
