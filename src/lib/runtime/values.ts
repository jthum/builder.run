/**
 * Convert values crossing a dynamic record or tool boundary to deterministic text.
 * Record fields are expected to be scalar, but JSON is safer than silently producing
 * "[object Object]" when malformed data contains a structured value.
 */
export function scalarString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

export function scalarEqual(left: unknown, right: unknown): boolean {
  return scalarString(left) === scalarString(right);
}
