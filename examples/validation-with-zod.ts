import { z } from "zod";
import { fields as f, loadSettings } from "../src/index.js";

/**
 * Example of advanced validation using Zod schemas.
 *
 * ```bash
 * EMAIL=user@example.com \
 * PORT=8080 \
 * HOST=example.com \
 * TIMEOUT_MS=30000 \
 * FEATURE_X_ENABLED=true \
 * node examples/validation-with-zod.ts
 * ```
 */

const settings = loadSettings({
  EMAIL: f.ZodSchema({ schema: z.string().email() }),
  PORT: f.ZodSchema({ schema: z.coerce.number().int().min(1).max(65535) }),
  HOST: f.ZodSchema({ schema: z.string().min(1).max(255) }),
  TIMEOUT_MS: f.ZodSchema({ schema: z.coerce.number().positive().default(5000) }),
  FEATURE_X_ENABLED: f.ZodSchema({ schema: z.coerce.boolean().default(false) }),

  // optional: true allows it to be unset (becomes undefined)
  GITHUB_TOKEN: f.ZodSchema({ schema: z.string(), optional: true }),

  // Zod's union for type-safe environment-specific settings
  NODE_ENV: f.ZodSchema({
    schema: z.union([z.literal("development"), z.literal("production"), z.literal("test")]),
  }),
});

console.log(settings);
