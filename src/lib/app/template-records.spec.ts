import { describe, expect, it, vi } from "vite-plus/test";
import type { WorkspaceClient } from "@jthum/framework/client";
import type { AppTemplate } from "./templates/index.ts";
import { seedTemplateRecords } from "./template-records.ts";

function client(existing: Array<{ id: string; values: Record<string, never> }> = []) {
  let next = 0;
  const listRecords = vi.fn(async () => existing);
  const createRecord = vi.fn(async (_type: string, values: Record<string, never>) => ({
    id: `record-${++next}`,
    values,
  }));
  return {
    value: { listRecords, createRecord } as unknown as WorkspaceClient,
    createRecord,
  };
}

describe("template record seeding", () => {
  it("routes shared records to the Space and resolves aliases for App records", async () => {
    const space = client();
    const app = client();
    const sample = {
      key: "example",
      label: "Example",
      description: "Example",
      category: "projects",
      spec: {} as never,
      sharedCollections: [{ key: "contact" } as never],
      records: [
        { type: "contact", as: "jane", values: { name: "Jane" } },
        { type: "project", values: { name: "Launch", contact: "$jane" } },
      ],
    } satisfies AppTemplate;

    await seedTemplateRecords({ spaceClient: space.value, appClient: app.value }, sample);

    expect(space.createRecord).toHaveBeenCalledWith("contact", { name: "Jane" });
    expect(app.createRecord).toHaveBeenCalledWith("project", {
      name: "Launch",
      contact: "record-1",
    });
  });

  it("does not reseed an App that already has local records", async () => {
    const space = client();
    const app = client([{ id: "existing", values: {} }]);
    const sample = {
      key: "example",
      label: "Example",
      description: "Example",
      category: "projects",
      spec: {} as never,
      records: [{ type: "project", values: { name: "Launch" } }],
      sharedCollections: [],
    } satisfies AppTemplate;

    await seedTemplateRecords({ spaceClient: space.value, appClient: app.value }, sample);

    expect(app.createRecord).not.toHaveBeenCalled();
  });
});
