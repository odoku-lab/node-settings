import { fields as f, loadSettings } from "../src/index.js";

/**
 * Example of managing database connection settings with nested groups and templates.
 *
 * ```bash
 * DB_PRIMARY_HOST=db1.example.com \
 * DB_PRIMARY_PORT=5432 \
 * DB_PRIMARY_USER=admin \
 * DB_PRIMARY_PASSWORD=s3cret \
 * DB_PRIMARY_NAME=prod \
 * DB_READER_HOST=db2.example.com \
 * DB_READER_PORT=5432 \
 * DB_READER_USER=reader \
 * DB_READER_PASSWORD=readonly \
 * DB_READER_NAME=prod \
 * DB_POOL_MIN=2 \
 * DB_POOL_MAX=10 \
 * node examples/database-config.ts
 * ```
 */

const settings = loadSettings(
  {
    PRIMARY: {
      HOST: f.String(),
      PORT: f.Number({ default: 5432 }),
      USER: f.String(),
      PASSWORD: f.String(),
      NAME: f.String(),
      URL: f.Template(
        "postgresql://{PRIMARY.USER}:{PRIMARY.PASSWORD}@{PRIMARY.HOST}:{PRIMARY.PORT}/{PRIMARY.NAME}",
      ),
    },
    READER: {
      HOST: f.String(),
      PORT: f.Number({ default: 5432 }),
      USER: f.String(),
      PASSWORD: f.String(),
      NAME: f.String(),
      URL: f.Template(
        "postgresql://{READER.USER}:{READER.PASSWORD}@{READER.HOST}:{READER.PORT}/{READER.NAME}",
      ),
    },
    POOL: {
      MIN: f.Number({ default: 2 }),
      MAX: f.Number({ default: 10 }),
      TIMEOUT_MS: f.Number({ default: 30_000 }),
    },
  },
  { prefix: "DB_" },
);

console.log(settings.PRIMARY.URL);
console.log(settings.POOL.MIN);
