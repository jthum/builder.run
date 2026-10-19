import { afterEach, describe, expect, it } from "vite-plus/test";
import { createWorkspaceClient, type WorkspaceClient } from "@jthum/framework/client";
import type { Spec } from "@jthum/framework/spec";
import type { RemoteSnapshot } from "$lib/app/remote-contract.ts";
import { cleanupServerFixtures, fixture } from "./testing.ts";

afterEach(cleanupServerFixtures);

/** The editors share this contract; transport must not change definitions or logical values. */
async function editorWorkflow(client: WorkspaceClient) {
  const workspace = await client.getWorkspace();
  const spec: Spec = {
    ...workspace.spec,
    collections: [
      {
        id: "notes",
        key: "note",
        label: "Note",
        fields: [
          { id: "title", key: "title", label: "Title", type: "text", required: true },
          { id: "status", key: "status", label: "Status", type: "text", default: "active" },
          { id: "enabled", key: "enabled", label: "Enabled", type: "boolean", default: false },
        ],
      },
    ],
    views: [
      {
        id: "note-list",
        key: "notes",
        label: "Notes",
        source: "note",
        parameters: [{ key: "status", path: ["status"] }],
        query: {
          select: [
            { path: ["title"], as: "label" },
            { path: ["enabled"], as: "enabled" },
          ],
          sort: [{ path: ["title"], direction: "asc" }],
        },
      },
    ],
    forms: [
      {
        id: "create",
        key: "create_note",
        label: "Create note",
        mode: "create",
        collectionId: "notes",
        fieldIds: ["title", "status", "enabled"],
      },
      {
        id: "edit",
        key: "edit_note",
        label: "Edit note",
        mode: "edit",
        collectionId: "notes",
        fieldIds: ["title", "enabled"],
      },
      {
        id: "custom",
        key: "feedback",
        label: "Feedback",
        mode: "standalone",
        fields: [
          { id: "feedback", key: "feedback", label: "Feedback", type: "text", required: true },
        ],
      },
    ],
    pages: [
      {
        id: "overview",
        key: "overview",
        label: "Overview",
        layout: [{ id: "heading", kind: "block", block: "heading", config: { text: "Notes" } }],
      },
    ],
    rules: [
      {
        id: "summarize",
        key: "summarize",
        label: "Summarize",
        input: { message: { value: "text", required: true } },
        steps: [
          {
            id: "prepare",
            compute: { assign: { summary: { message: { $ref: "vars.message" }, ready: true } } },
          },
        ],
        result: { $ref: "vars.summary" },
      },
    ],
  };
  await client.applySpec(spec);
  const created = await client.submitForm("create_note", {
    values: { title: "Zulu", enabled: true },
  });
  if (created.mode === "standalone") throw new Error("Expected a record Form.");
  await client.submitForm("edit_note", {
    recordId: created.record.id,
    values: { title: "Alpha", enabled: false },
  });
  await client.createRecord("note", { title: "Hidden", status: "done" });
  const filtered = await client.queryView("notes", { parameters: { status: "active" } });
  const custom = await client.submitForm("feedback", { values: { feedback: "Works" } });
  const rule = await client.runRule("summarize", { input: { message: "Ready" } });
  const execution = await client.startRule("summarize", { input: { message: "Durable" } });
  // Definition identity remains stable; the record and Form survive a semantic field-key rename.
  const renamed: Spec = {
    ...spec,
    collections: spec.collections.map((collection) => ({
      ...collection,
      fields: collection.fields.map((field) =>
        field.id === "title" ? { ...field, key: "headline", label: "Headline" } : field,
      ),
    })),
  };
  await client.applySpec(renamed);
  const record = await client.getRecord("note", created.record.id);
  const view = await client.queryView("notes", { parameters: { status: "active" } });
  let validation: string | undefined;
  try {
    await client.submitForm("create_note", { values: { enabled: "not-a-boolean" } });
  } catch (error) {
    validation = (error as { code?: string }).code;
  }
  return {
    definitions: {
      collections: (await client.getWorkspace()).spec.collections,
      views: await client.listViews(),
      forms: await client.listForms(),
      page: await client.getPage("overview"),
    },
    beforeRename: filtered.data.rows.map((row) => row.values),
    afterRename: view.data.rows.map((row) => row.values),
    record: record?.values,
    custom,
    rule: rule.result,
    execution: { status: execution.status, result: execution.result },
    validation,
  };
}

describe("Workspace client deployment parity", () => {
  it("preserves editor definitions, field renames, typed values, Forms, Views, Pages and Rules across HTTP", async () => {
    const f = await fixture();
    const direct = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: f.snapshot.app.id,
      actorId: f.snapshot.actorId,
    });
    const localResult = await editorWorkflow(direct);
    const second = (await f.command(
      "createApp",
      { name: "Remote" },
      f.snapshot.selection,
    )) as RemoteSnapshot;
    const httpResult = await editorWorkflow(f.client(second));
    expect(httpResult).toEqual(localResult);
    expect(httpResult.beforeRename).toEqual([{ label: "Alpha", enabled: false }]);
    expect(httpResult.afterRename).toEqual(httpResult.beforeRename);
    expect(httpResult.record).toMatchObject({ headline: "Alpha", enabled: false });
    expect(httpResult.rule).toEqual({ message: "Ready", ready: true });
    expect(httpResult.execution).toMatchObject({ status: "completed" });
    expect(httpResult.validation).toBe("VALIDATION.INVALID_INPUT");
  });
});
