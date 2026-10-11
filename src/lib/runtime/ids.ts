import { nanoid } from "nanoid";

export function createSpecId(): string {
  return nanoid(16);
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
