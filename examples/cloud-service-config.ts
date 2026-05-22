import { fields as f, loadSettings } from "../src/index.js";

/**
 * Practical example of managing cloud service (AWS / GCP, etc.) configuration.
 * Demonstrates constant fields and JSON parsing.
 *
 * ```bash
 * AWS_REGION=us-east-1 \
 * AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE \
 * AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
 * AWS_S3_BUCKET=my-app-assets \
 * AWS_S3_PUBLIC_URL_BASE=https://cdn.example.com \
 * AWS_LAMBDA_FUNCTION_NAME=my-function \
 * AWS_LAMBDA_TIMEOUT_SECONDS=30 \
 * AWS_LAMBDA_MEMORY_MB=512 \
 * AWS_TAGS={"env":"production","team":"backend","cost-center":"1234"} \
 * CLOUDFRONT_DISTRIBUTION_ID=E1A2B3C4D5E6F7 \
 * node examples/cloud-service-config.ts
 * ```
 */

const settings = loadSettings(
  {
    // Constant field — stored as a fixed value, not read from env
    APP_NAME: "@odoku-lab/settings",
    VERSION: "0.0.1",
    SUPPORTED_REGIONS: ["us-east-1", "eu-west-1"] as const,

    // Region is a restricted enum
    REGION: f.String({
      options: ["us-east-1", "us-west-2", "eu-west-1", "ap-northeast-1"] as const,
    }),

    // Credentials
    ACCESS_KEY_ID: f.String(),
    SECRET_ACCESS_KEY: f.String(),

    // S3
    S3: {
      BUCKET: f.String(),
      PUBLIC_URL_BASE: f.String({ optional: true }),
      ACL: f.String({ default: "private" }),
    },

    // Lambda
    LAMBDA: {
      FUNCTION_NAME: f.String(),
      TIMEOUT_SECONDS: f.Number({ default: 30 }),
      MEMORY_MB: f.Number({ default: 128 }),
      RESERVED_CONCURRENCY: f.Number({ optional: true }),
    },

    // CloudFront
    CLOUDFRONT_DISTRIBUTION_ID: f.String({ optional: true }),

    // Tags received as JSON
    TAGS: f.Json<Record<string, string>>({ default: {} }),
  },
  { prefix: "AWS_" },
);

console.log("App:", settings.APP_NAME, settings.VERSION);
console.log("Region:", settings.REGION);
console.log("S3 bucket:", settings.S3.BUCKET);
console.log("Lambda timeout:", settings.LAMBDA.TIMEOUT_SECONDS);
console.log("Tags:", settings.TAGS);
