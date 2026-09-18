import { scalarString } from "../../values.ts";

export function bindValue(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return scalarString(value);
}
