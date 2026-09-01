import { nanoid } from "nanoid";

export type IdKind =
  | "env"
  | "wsp"
  | "act"
  | "sto"
  | "typ"
  | "fld"
  | "vw"
  | "frm"
  | "flw"
  | "pg"
  | "rec"
  | "run";

export function createId(kind: IdKind): string {
  return `${kind}_${nanoid(12)}`;
}

export function isId(value: string, kind?: IdKind): boolean {
  if (kind) return value.startsWith(`${kind}_`);
  return /^(env|wsp|act|sto|typ|fld|vw|frm|flw|pg|rec|run)_/.test(value);
}

export function labelFromKey(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
