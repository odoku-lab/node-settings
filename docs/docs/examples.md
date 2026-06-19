# 実装サンプル

## Express / Fastify との組み合わせ

### スキーマ定義ファイル（settings.ts）

スキーマは専用ファイルに切り出し、アプリ全体で import して使います。

```typescript
import { defineSettings, type InferSettings, types as t } from "@odoku-lab/settings";

export const settings = defineSettings({
  nodeEnv: t.string({
    options: ["development", "production", "test"] as const,
    default: "development",
  }),
  host: t.string({ default: "0.0.0.0" }),
  port: t.number({ default: 3000, integer: true, min: 1024, max: 65535 }),
  databaseUrl: t.string(),
  redisUrl: t.url({ default: new URL("redis://localhost:6379") }),
  logLevel: t.string({
    options: ["debug", "info", "warn", "error"] as const,
    default: "info",
  }),
});

export type Settings = InferSettings<typeof settings>;
```

### エントリポイント（index.ts）

起動時に `$load()` で全フィールドを一括検証します。設定不備があれば起動前にまとめてエラー表示できます。

```typescript
import { SettingsValidationError } from "@odoku-lab/settings";
import { settings } from "./settings";

async function main() {
  // 全フィールドを解決・検証（不備があればここで止まる）
  try {
    await settings.$load();
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      console.error("設定エラー:");
      for (const err of e.errors) console.error(" ", err.message);
      process.exit(1);
    }
    throw e;
  }

  const app = createApp();
  app.listen(settings.port.$value(), settings.host.$value());
}

main();
```

### Express アプリ（app.ts）

```typescript
import express from "express";
import { settings } from "./settings";

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", env: settings.nodeEnv.$value() });
  });

  return app;
}
```

### Fastify アプリ（app.ts）

```typescript
import Fastify from "fastify";
import { settings } from "./settings";

export function createApp() {
  const app = Fastify({ logger: { level: settings.logLevel.$value() } });

  app.get("/health", async () => {
    return { status: "ok", env: settings.nodeEnv.$value() };
  });

  return app;
}
```

---

## テスト時の設定差し替え

`source` オプションを使うと `process.env` を汚染せずにテスト用の値を注入できます。

### テスト用のファクトリー関数

```typescript
import { defineSettings, types as t } from "@odoku-lab/settings";

// 本番用のスキーマ定義
const schema = {
  port: t.number({ default: 3000 }),
  databaseUrl: t.string(),
  apiKey: t.string(),
};

// テスト用: デフォルト値付きでスキーマを生成するファクトリー
function createTestSettings(overrides: Record<string, string> = {}) {
  return defineSettings(schema, {
    source: {
      PORT: "3000",
      DATABASE_URL: "postgres://localhost:5432/testdb",
      API_KEY: "test-key",
      ...overrides,
    },
  });
}
```

### vitest / Jest でのテスト例

```typescript
import { describe, expect, it } from "vitest";
import { createTestSettings } from "./test-helpers";

describe("設定のテスト", () => {
  it("デフォルト値が正しく解決される", () => {
    const settings = createTestSettings();
    expect(settings.port.$value()).toBe(3000);
    expect(settings.databaseUrl.$value()).toBe("postgres://localhost:5432/testdb");
  });

  it("overrides で個別に上書きできる", () => {
    const settings = createTestSettings({ PORT: "9000" });
    expect(settings.port.$value()).toBe(9000);
  });

  it("必須フィールドが未設定なら MissingEnvError をスロー", () => {
    const settings = createTestSettings({ API_KEY: undefined as unknown as string });
    expect(() => settings.apiKey.$value()).toThrow("Missing required environment variable");
  });
});
```

### $mutate を使ったテスト内部での差し替え

テストケースごとに値を変えたい場合は `$mutate()` と `$reset()` も使えます。

```typescript
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { settings } from "../settings";

describe("ポート番号のバリデーション", () => {
  afterEach(() => {
    settings.$reset(); // 各テスト後にリセット
  });

  it("上書きした値が反映される", () => {
    settings.$mutate({ port: 9000 });
    expect(settings.port.$value()).toBe(9000);
  });

  it("リセット後は元の値に戻る", () => {
    settings.$mutate({ port: 9000 });
    settings.$reset();
    expect(settings.port.$value()).toBe(3000); // デフォルト値
  });
});
```
