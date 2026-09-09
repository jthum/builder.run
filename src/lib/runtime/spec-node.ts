export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type SpecMeta = Record<string, JsonValue>;

export interface SpecNode {
  id: string;
  meta?: SpecMeta;
}

export function normalizeSpecMeta(value: unknown, owner: string): SpecMeta | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) throw new Error(`${owner} meta must be a JSON object`);
  assertJsonValue(value, `${owner}.meta`);
  return structuredClone(value) as SpecMeta;
}

function assertJsonValue(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${path} must contain finite JSON numbers`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${path}.${key}`);
    return;
  }
  throw new Error(`${path} must contain only JSON-compatible values`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
