import { config as dotenvConfig } from "dotenv";

/** 環境変数の読み取り元。process.env または envFile をマージしたオブジェクト。 */
export type EnvSource = Record<string, string | undefined>;

/**
 * envFile が指定されていれば読み込み、process.env とマージした読み取り元を返す。
 * dotenv の processEnv オプションでローカルオブジェクトに読み込むため、
 * process.env を汚染しない。既存の process.env が envFile より優先される。
 */
export function buildEnvSource(envFile: string | undefined): EnvSource {
  if (envFile === undefined) return process.env;
  const parsed: Record<string, string> = {};
  dotenvConfig({ path: envFile, processEnv: parsed });
  return { ...parsed, ...process.env };
}
