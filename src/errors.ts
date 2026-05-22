/**
 * Base error class for all errors thrown by the settings library.
 *
 * Consumers can catch any library-specific error with `instanceof SettingsError`.
 */
export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
    Object.setPrototypeOf(this, SettingsError.prototype);
  }
}

/**
 * Thrown when a required environment variable is not set.
 */
export class MissingEnvError extends SettingsError {
  /** The logical field name of the missing environment variable. */
  readonly fieldName: string;

  constructor(fieldName: string) {
    super(`Missing required environment variable: ${fieldName}`);
    this.name = "MissingEnvError";
    this.fieldName = fieldName;
    Object.setPrototypeOf(this, MissingEnvError.prototype);
  }
}

/**
 * Thrown when an environment variable value fails type conversion or validation.
 */
export class InvalidValueError extends SettingsError {
  /** The logical field name that received the invalid value. */
  readonly fieldName: string;

  constructor(fieldName: string, reason: string) {
    super(`Invalid value for ${fieldName}: ${reason}`);
    this.name = "InvalidValueError";
    this.fieldName = fieldName;
    Object.setPrototypeOf(this, InvalidValueError.prototype);
  }
}

/**
 * Thrown when the schema definition itself is invalid (e.g., unknown type name, unconfigured validator).
 */
export class SchemaDefinitionError extends SettingsError {
  constructor(message: string) {
    super(message);
    this.name = "SchemaDefinitionError";
    Object.setPrototypeOf(this, SchemaDefinitionError.prototype);
  }
}

/**
 * Aggregates multiple field validation errors into a single report.
 *
 * `loadSettings` validates all fields before throwing, so you can see all
 * missing or invalid settings at once during initial setup.
 */
export class SettingsValidationError extends SettingsError {
  /** The list of individual errors that were aggregated. */
  readonly errors: SettingsError[];

  constructor(errors: SettingsError[]) {
    const detail = errors.map((e) => `  - ${e.message}`).join("\n");
    super(`Failed to load settings (${errors.length} error(s)):\n${detail}`);
    this.name = "SettingsValidationError";
    this.errors = errors;
    Object.setPrototypeOf(this, SettingsValidationError.prototype);
  }
}
