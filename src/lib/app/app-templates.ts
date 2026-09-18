import { nanoid } from "nanoid";
import { editorContextFromSpec } from "@jthum/framework/svelte/studio/adapters";
import { createApp, type AppContext, type AppRuntime } from "$lib/framework/bootstrap.ts";
import { projectFrameworkSpec, assertFrameworkProjectionReady } from "$lib/framework/projection.ts";
import { normalizeSpec, type TypeDef } from "$lib/runtime/model.ts";
import { slugify } from "$lib/runtime/ids.ts";
import { newAppSpec, sampleApps } from "$lib/runtime/samples.ts";
import { seedTemplateRecords } from "./template-records.ts";

/** Template definitions are host content; all installation writes use the canonical Kernel. */
export async function seedApp(
  runtime: AppRuntime,
  name: string,
  template?: string | null,
): Promise<AppContext> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name required");
  const sample = template ? sampleApps.find((item) => item.key === template) : undefined;
  if (template && !sample) throw new Error(`Unknown template ${template}`);
  const space = await runtime.spaceClient.getWorkspace();
  const existing = editorContextFromSpec(space.spec).collections.map((collection) => ({
    ...collection,
    store: "local",
    expose: true,
  })) as TypeDef[];
  const keys = new Set(existing.map((collection) => collection.key));
  const incoming = (sample?.exposedTypes ?? []).filter((collection) => !keys.has(collection.key));
  const sharedTypes = [...existing, ...incoming];
  const appSpec = sample
    ? normalizeSpec({ ...sample.spec, id: nanoid() })
    : newAppSpec(slugify(trimmed), trimmed);
  const projection = projectFrameworkSpec(appSpec, { sharedTypes });
  assertFrameworkProjectionReady(projection);
  if (incoming.length) {
    const sharedProjection = projectFrameworkSpec(
      normalizeSpec({
        key: "shared",
        label: "Shared",
        types: sharedTypes,
      }),
      { sharedTypes: [] },
    );
    assertFrameworkProjectionReady(sharedProjection);
    const incomingKeys = new Set(incoming.map((collection) => collection.key));
    await runtime.spaceClient.applySpec({
      ...space.spec,
      collections: [
        ...space.spec.collections,
        ...sharedProjection.spec.collections.filter((collection) =>
          incomingKeys.has(collection.key),
        ),
      ],
    });
  }
  const app = await createApp(runtime.kernel, runtime.spaceContext, {
    name: trimmed,
    spec: appSpec,
    sharedTypes,
  });
  if (sample) await seedTemplateRecords(app, sample);
  return app;
}
