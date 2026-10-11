import { createSpecId } from "$lib/runtime/ids.ts";
import type { WorkspaceClient } from "@jthum/framework/client";
import type { CollectionDefinition, PageDefinition, Spec } from "@jthum/framework/spec";
import {
  editorContextFromSpec,
  formDefinitionFromDraft,
  viewDefinitionFromDraft,
  type ViewAuthoringSchemas,
} from "@jthum/framework/svelte/authoring/data";

export async function installCollectionStarters(
  client: WorkspaceClient,
  collection: CollectionDefinition,
  schemas: ViewAuthoringSchemas,
): Promise<Spec> {
  const workspace = await client.getWorkspace();
  const context = editorContextFromSpec(workspace.spec, { schemas });
  const viewKey = `${collection.key}_list`;
  const createKey = `${collection.key}_create`;
  const editKey = `${collection.key}_edit`;
  const pageKey = `${collection.key}_page`;
  const fields = collection.fields.slice(0, 6).map((field) => {
    if (field.type !== "reference") return field.key;
    const target = Object.values(schemas).find((schema) => schema.id === field.sourceId);
    const label =
      target?.fields.find((candidate) => ["name", "title", "label"].includes(candidate.key)) ??
      target?.fields.find((candidate) => candidate.type === "text");
    return label ? `${field.key}.${label.key}` : field.key;
  });
  const views = workspace.spec.views.some((view) => view.key === viewKey)
    ? workspace.spec.views
    : [
        ...workspace.spec.views,
        viewDefinitionFromDraft(
          {
            id: createSpecId(),
            key: viewKey,
            label: collection.label,
            source: collection.key,
            fields,
            implicit: true,
          },
          schemas,
        ),
      ];
  const forms = [...workspace.spec.forms];
  for (const [key, label, mode] of [
    [createKey, `New ${collection.label}`, "create"],
    [editKey, `Edit ${collection.label}`, "edit"],
  ] as const) {
    if (forms.some((form) => form.key === key)) continue;
    forms.push(
      formDefinitionFromDraft(
        {
          id: createSpecId(),
          key,
          label,
          mode,
          type: collection.key,
          fields: collection.fields.map((field) => field.key),
          implicit: true,
        },
        workspace.spec,
        context.collections,
      ),
    );
  }
  const pages = workspace.spec.pages.some((page) => page.key === pageKey)
    ? workspace.spec.pages
    : [
        ...workspace.spec.pages,
        {
          id: createSpecId(),
          key: pageKey,
          label: collection.label,
          meta: { authoring: { managed: true }, path: `/t/${collection.key}` },
          layout: [
            {
              id: createSpecId(),
              kind: "group",
              columns: 1,
              children: [
                {
                  id: createSpecId(),
                  kind: "block",
                  block: "table",
                  config: { view: viewKey },
                },
              ],
            },
          ],
        } satisfies PageDefinition,
      ];
  const updated = await client.applySpec({ ...workspace.spec, views, forms, pages });
  return updated.spec;
}
