import { fields as f, loadSettings } from "../src/index.js";

/**
 * Example of loading web server settings from environment variables
 * (e.g., APP_PORT=8080 APP_HOST=0.0.0.0 APP_DEBUG=true ...).
 *
 * ```bash
 * APP_PORT=8080 \
 * APP_HOST=0.0.0.0 \
 * APP_DEBUG=true \
 * APP_DB_URL=postgresql://localhost:5432/mydb \
 * APP_LOG_LEVEL=info \
 * APP_CORS_ORIGINS=http://localhost:3000,https://example.com \
 * node examples/web-server.ts
 * ```
 */

const settings = loadSettings(
  {
    PORT: f.Number({ default: 3000 }),
    HOST: f.String({ default: "127.0.0.1" }),
    DEBUG: f.Boolean({ default: false }),
    DB_URL: f.Template("postgresql://{DB_HOST}:{DB_PORT}/{DB_NAME}"),
    DB_HOST: f.String({ default: "localhost" }),
    DB_PORT: f.Number({ default: 5432 }),
    DB_NAME: f.String({ default: "app" }),
    LOG_LEVEL: f.String({ options: ["debug", "info", "warn", "error"] as const, default: "info" }),
    CORS_ORIGINS: f.Array({ delimiter: "," }),
    RATE_LIMIT_WINDOW_MS: f.Number({ default: 60_000 }),
    RATE_LIMIT_MAX: f.Number({ default: 100 }),
  },
  { prefix: "APP_" },
);

console.log(settings);
