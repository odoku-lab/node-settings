import { SchemaDefinitionError } from "./errors.js";

/**
 * テンプレート文字列内のプレースホルダーを解決済み値で置換する。
 *
 * プレースホルダーは `{KEY}` または `{KEY.NESTED.PATH}` の形式。
 * 存在しないキーは {@link SchemaDefinitionError} をスロー。
 *
 * @param template - 置換対象のテンプレート文字列
 * @param resolved - 置換用の値を持つオブジェクト
 * @returns 置換済みの文字列
 * @throws {SchemaDefinitionError} プレースホルダーが見つからない場合
 */
export function resolveTemplate(template: string, resolved: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, path: string) => {
    let value: unknown = resolved;

    for (const part of path.split(".")) {
      if (value === null || typeof value !== "object") {
        throw new SchemaDefinitionError(`Template reference not found: ${path}`);
      }
      value = (value as Record<string, unknown>)[part];
      if (value === undefined) {
        throw new SchemaDefinitionError(`Template reference not found: ${path}`);
      }
    }

    return String(value);
  });
}
