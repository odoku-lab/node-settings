import * as v from "valibot";
import { fields as f, loadSettings } from "../src/index.js";

/**
 * Example of validation using Valibot schemas.
 *
 * ```bash
 * PORT=8080 \
 * EMAIL=admin@example.com \
 * URL=https://api.example.com/v1 \
 * LOG_LEVEL=info \
 * node examples/validation-with-valibot.ts
 * ```
 */

const settings = loadSettings({
  PORT: f.ValibotSchema({
    schema: v.pipe(
      v.string(),
      v.transform(Number),
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(65535),
    ),
  }),
  EMAIL: f.ValibotSchema({
    schema: v.pipe(v.string(), v.email()),
  }),
  URL: f.ValibotSchema({
    schema: v.pipe(v.string(), v.url()),
  }),
  LOG_LEVEL: f.ValibotSchema({
    schema: v.pipe(v.string(), v.picklist(["debug", "info", "warn", "error"])),
  }),

  // Default value via fallback
  TIMEOUT_MS: f.ValibotSchema({
    schema: v.fallback(v.pipe(v.string(), v.transform(Number), v.number()), 5000),
  }),

  // optional: true allows it to be unset
  API_KEY: f.ValibotSchema({ schema: v.string(), optional: true }),
});

console.log(settings);
