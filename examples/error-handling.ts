import {
  fields as f,
  InvalidValueError,
  loadSettings,
  MissingEnvError,
  SettingsValidationError,
} from "../src/index.js";

/**
 * Practical error handling patterns.
 *
 * loadSettings does not stop at the first error; it validates all fields and
 * throws a single SettingsValidationError aggregating all errors. This lets you
 * see all missing settings at once during initial setup.
 *
 * ```bash
 * # Run with no settings to see 3 aggregated errors
 * node examples/error-handling.ts
 *
 * # Set only one variable
 * APP_HOST=localhost node examples/error-handling.ts
 * ```
 */

function loadAppSettings() {
  return loadSettings(
    {
      HOST: f.String(),
      PORT: f.Number({ default: 8080 }),
      DB_URL: f.String(),
      API_KEY: f.String(),
      DEBUG: f.Boolean({ default: false }),
    },
    { prefix: "APP_" },
  );
}

try {
  const settings = loadAppSettings();
  console.log("Settings loaded:", settings);
} catch (e) {
  if (e instanceof SettingsValidationError) {
    console.error(`Failed to load settings (${e.errors.length} error(s)):\n`);
    for (const err of e.errors) {
      if (err instanceof MissingEnvError) {
        console.error(`  [MISSING] ${err.fieldName} — environment variable not set`);
      } else if (err instanceof InvalidValueError) {
        console.error(`  [INVALID] ${err.fieldName} — ${err.message}`);
      } else {
        console.error(`  [ERROR] ${err.message}`);
      }
    }
    process.exit(1);
  }
  throw e;
}
