import { createHash } from "node:crypto";

/**
 * Stable serializer for content addressing (PRD §7.3 rule 2): JSON text with object keys sorted by
 * default JS string order (UTF-16 code units) and no whitespace. Strict: anything JSON cannot
 * represent faithfully throws a TypeError instead of being dropped or coerced — `undefined` (as a
 * property value, array item, sparse-array hole or top-level value), NaN/±Infinity, bigint,
 * functions, symbols and non-plain objects (Date, Map, class instances). `-0` renders as `0`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        const items: string[] = [];
        // Index loop (not .map) so sparse holes reach the undefined rejection.
        for (let i = 0; i < value.length; i++) items.push(canonicalJson(value[i]));
        return `[${items.join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new TypeError("canonicalJson: only plain objects and arrays");
      const obj = value as Record<string, unknown>;
      const parts = Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
export const contentHash = (value: unknown): string => sha256Hex(canonicalJson(value));
