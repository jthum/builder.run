import { nanoid } from "nanoid";
import { assertValidSpec, type CollectionDefinition, type Spec } from "@jthum/framework/spec";
import {
  createApp,
  emptySpec,
  type AppContext,
  type AppRuntime,
} from "$lib/framework/bootstrap.ts";
import { slugify } from "$lib/runtime/ids.ts";
import { appTemplates } from "./templates/index.ts";
import { seedTemplateRecords } from "./template-records.ts";

const referenceKeys = new Set([
  "id",
  "sourceId",
  "fieldId",
  "collectionId",
  "titleFieldId",
  "formId",
  "ruleId",
  "fieldIds",
  "path",
  "paths",
  "labelPath",
]);

/** Fresh definition identities, retaining opaque metadata and literal values verbatim. */
export function instantiateDefinitions<T>(value: T, identities = new Map<string, string>()): T {
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (
        key === "meta" ||
        key === "default" ||
        key === "value" ||
        key === "config" ||
        key === "input"
      )
        continue;
      if (key === "id" && typeof child === "string" && !identities.has(child))
        identities.set(child, nanoid());
      else collect(child);
    }
  };
  collect(value);
  const rewrite = (node: unknown, key = ""): unknown => {
    if (typeof node === "string")
      return referenceKeys.has(key) ? (identities.get(node) ?? node) : node;
    if (Array.isArray(node)) return node.map((child) => rewrite(child, key));
    if (!node || typeof node !== "object") return node;
    const recordAction =
      (key === "action" || key === "compensate") &&
      "key" in node &&
      (node.key === "records.create" || node.key === "records.update");
    return Object.fromEntries(
      Object.entries(node).map(([name, child]) => [
        name,
        name === "meta" || name === "default" || name === "value" || name === "config"
          ? child
          : recordAction && name === "input" && child && typeof child === "object"
            ? Object.fromEntries(
                Object.entries(child).map(([inputKey, inputValue]) => [
                  inputKey,
                  inputKey === "values" &&
                  inputValue &&
                  typeof inputValue === "object" &&
                  !Array.isArray(inputValue)
                    ? Object.fromEntries(
                        Object.entries(inputValue).map(([fieldId, fieldValue]) => [
                          identities.get(fieldId) ?? fieldId,
                          rewrite(fieldValue),
                        ]),
                      )
                    : rewrite(inputValue, inputKey),
                ]),
              )
            : rewrite(child, name),
      ]),
    );
  };
  return rewrite(value) as T;
}

export async function seedApp(
  runtime: AppRuntime,
  name: string,
  template?: string | null,
): Promise<AppContext> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name required");
  const sample = template ? appTemplates.find((item) => item.key === template) : undefined;
  if (template && !sample) throw new Error(`Unknown template ${template}`);
  const space = await runtime.spaceClient.getWorkspace();
  const identities = new Map<string, string>();
  for (const shared of sample?.sharedCollections ?? []) {
    const existing = space.spec.collections.find((collection) => collection.key === shared.key);
    if (!existing) continue;
    identities.set(shared.id, existing.id);
    for (const field of shared.fields) {
      const current = existing.fields.find((candidate) => candidate.key === field.key);
      if (!current)
        throw new Error(`Shared Collection ${shared.key} is missing template Field ${field.key}.`);
      identities.set(field.id, current.id);
    }
  }
  const instantiated = sample
    ? instantiateDefinitions(
        {
          spec: sample.spec,
          sharedCollections: sample.sharedCollections,
        },
        identities,
      )
    : undefined;
  const incoming: readonly CollectionDefinition[] =
    instantiated?.sharedCollections.filter(
      (collection) => !space.spec.collections.some((existing) => existing.key === collection.key),
    ) ?? [];
  const spec: Spec = instantiated?.spec ?? {
    ...emptySpec(slugify(trimmed), trimmed),
    sources: space.spec.collections.map(({ id, key, label }) => ({ id, key, label })),
  };
  assertValidSpec(spec);
  if (incoming.length)
    await runtime.spaceClient.applySpec({
      ...space.spec,
      collections: [...space.spec.collections, ...incoming],
    });
  const app = await createApp(runtime.kernel, runtime.spaceContext, { name: trimmed, spec });
  if (sample) await seedTemplateRecords(app, sample);
  return app;
}
