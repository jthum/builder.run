import { describe, expect, it } from "vite-plus/test";
import { createWorkspaceClient } from "@jthum/framework/client";
import { Kernel } from "@jthum/framework/kernel";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import {
  createCollection,
  editorContextFromSpec,
  isAuthoringManaged,
} from "@jthum/framework/svelte/authoring/data";
import { installCollectionStarters } from "./collection-starters.ts";

describe("Builder Collection starters", () => {
  it("installs explicit managed resources around a new Collection", async () => {
    const kernel = await Kernel.open({ persistence: new MemoryPersistenceAdapter() });
    const root = await kernel.createRootWorkspace({ name: "Space", user: { name: "Jane" } });
    const client = await createWorkspaceClient(kernel, {
      workspaceId: root.workspace.id,
      actorId: root.user.id,
    });
    const collection = await createCollection(client, {
      key: "project",
      label: "Project",
      fields: [
        { id: "", key: "title", label: "Title", type: "text" },
        { id: "", key: "budget", label: "Budget", type: "number" },
      ],
    });
    const spec = await installCollectionStarters(client, collection, { project: collection });

    expect(spec.views).toEqual([
      expect.objectContaining({ key: "project_list", source: "project" }),
    ]);
    expect(spec.forms).toEqual([
      expect.objectContaining({ key: "project_create", mode: "create" }),
      expect.objectContaining({ key: "project_edit", mode: "edit" }),
    ]);
    expect(spec.pages).toEqual([
      expect.objectContaining({
        key: "project_page",
        meta: expect.objectContaining({ path: "/t/project" }),
      }),
    ]);
    expect(
      [...spec.views, ...spec.forms, ...spec.pages].every((item) => isAuthoringManaged(item.meta)),
    ).toBe(true);
    const studio = editorContextFromSpec(spec, { schemas: { project: collection } });
    expect(studio.views[0]?.implicit).toBe(true);
    expect(studio.forms.every((form) => form.implicit)).toBe(true);
    await kernel.close();
  });
});
