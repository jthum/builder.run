import { customAlphabet } from "nanoid";

const idAlphabet = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  12,
);

export type IdKind =
  | "spc"
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
  const id = idAlphabet();
  if (kind === "spc") return id;
  return `${kind}_${id}`;
}

export function isId(value: string, kind?: IdKind): boolean {
  if (kind) return value.startsWith(`${kind}_`);
  return /^(spc|act|sto|typ|fld|vw|frm|flw|pg|rec|run)_/.test(value);
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

export function uniqueKey(base: string, taken: Iterable<string>, fallback = "item"): string {
  const slug = slugify(base) || fallback;
  const used = new Set(taken);
  if (!used.has(slug)) return slug;
  let index = 2;
  while (used.has(`${slug}_${index}`)) index += 1;
  return `${slug}_${index}`;
}
