import { describe, expect, it, vi } from "vite-plus/test";
import type { CollectionDraft } from "@jthum/framework/svelte/authoring/data";
import {
  loadRecordDetails,
  presentRecord,
  recordPageHref,
  relatedRecordQuery,
} from "./record-details.ts";
import { RecordLoader } from "./record-loader.svelte.ts";

const type: CollectionDraft = {
  id: "projects",
  key: "project",
  label: "Project",
  lifecycle: { field: "status", initial: "open", transitions: [] },
  fields: [
    { id: "name", key: "name", label: "Name", type: "text" },
    {
      id: "desc",
      key: "description",
      label: "Description",
      type: "text",
      presentation: "textarea",
    },
    { id: "status", key: "status", label: "Status", type: "enum", values: ["open", "done"] },
    { id: "budget", key: "budget", label: "Budget", type: "number" },
    { id: "enabled", key: "enabled", label: "Enabled", type: "boolean" },
    { id: "notes", key: "notes", label: "Notes", type: "text", presentation: "textarea" },
    { id: "client", key: "client", label: "Client", type: "reference", target: "client" },
  ],
};

describe("record details", () => {
  it("pushes relationship restrictions into the query without losing filters, aliases or limits", () => {
    const view = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      query: {
        select: [{ path: ["name-id"], as: ["task", "title"] }],
        filter: { path: ["status-id"], operator: "eq" as const, value: "open" },
        limit: 20,
      },
      parameters: [{ key: "record_id", path: ["owner-id"], source: "context" as const }],
    };
    const query = relatedRecordQuery(view, "project-id", "project-one");
    expect(query.select).toEqual(view.query.select);
    expect(query.limit).toBe(20);
    expect(query.filter).toEqual({
      all: [
        { path: ["project-id"], operator: "eq", value: "project-one" },
        view.query.filter,
        { path: ["owner-id"], operator: "eq", value: "project-one" },
      ],
    });
  });
  it("gives the title, description and lifecycle status hierarchy without losing zero or false", () => {
    const record = {
      name: "Launch",
      description: "A focused launch",
      status: "open",
      budget: 0,
      enabled: false,
      notes: "First\nSecond",
      client: "opaque-id",
    };
    const result = presentRecord(type, record, {
      client: { label: "Northwind", href: "/t/client/one" },
    });
    expect(result.title).toBe("Launch");
    expect(result.description).toBe("A focused launch");
    expect(result.statusKey).toBe("status");
    expect(result.properties.map((property) => property.key)).toEqual([
      "budget",
      "enabled",
      "notes",
      "client",
    ]);
    expect(result.properties.map((property) => property.value)).toEqual([
      0,
      false,
      "First\nSecond",
      "Northwind",
    ]);
    expect(result.properties.find((property) => property.key === "notes")?.multiline).toBe(true);
    expect(result.properties.find((property) => property.key === "budget")?.highlight).toBe(true);
    expect(record.client).toBe("opaque-id");
  });

  it("retains field order without categories and only promotes actual numeric values", () => {
    const schema: CollectionDraft = {
      ...type,
      fields: [
        ...type.fields,
        { id: "due", key: "due", label: "Due", type: "date" },
        { id: "meeting", key: "meeting", label: "Meeting", type: "datetime" },
        { id: "rating", key: "rating", label: "Rating", type: "number", presentation: "rating" },
      ],
    };
    const result = presentRecord(schema, {
      name: "Launch",
      budget: 0,
      due: "2026-10-17",
      meeting: "2026-10-17T12:00:00Z",
      rating: 4,
      enabled: false,
    });
    expect(
      result.properties.filter((property) => property.highlight).map((property) => property.key),
    ).toEqual(["budget"]);
    expect(result.properties.map((property) => property.key)).toEqual([
      "description",
      "status",
      "budget",
      "enabled",
      "notes",
      "client",
      "due",
      "meeting",
      "rating",
    ]);
    expect(result.properties.every((property) => !("group" in property))).toBe(true);
    expect(result.properties.find((property) => property.key === "enabled")?.value).toBe(false);
    expect(
      presentRecord(schema, { budget: null }).properties.find(
        (property) => property.key === "budget",
      )?.highlight,
    ).toBe(false);
  });

  it("does not expose opaque reference identities as fallback labels", () => {
    const result = presentRecord(type, { name: "Launch", client: "private-reference" });
    expect(result.properties.find((property) => property.key === "client")?.value).toBe(
      "Unavailable",
    );
    expect(JSON.stringify(result)).not.toContain("private-reference");
    expect(recordPageHref("task/list", "a/b?#")).toBe("/t/task%2Flist/a%2Fb%3F%23");
  });

  it("loads only the selected record and deduplicates its immediate references", async () => {
    const schema = {
      ...type,
      fields: [
        ...type.fields,
        {
          id: "billing",
          key: "billing_client",
          label: "Billing client",
          type: "reference" as const,
          target: "space.client",
        },
      ],
    };
    const getRecord = vi.fn(async (key: string) =>
      key === "project"
        ? { id: "p1", name: "Launch", client: "c1", billing_client: "c1" }
        : { id: "c1", name: "Northwind" },
    );
    const result = await loadRecordDetails(schema, "p1", getRecord, [type]);
    expect(getRecord).toHaveBeenCalledTimes(2);
    expect(result.references.client).toEqual({ label: "Northwind", href: "/t/client/c1" });
    expect(result.references.billing_client).toEqual(result.references.client);
  });

  it("isolates unreadable or missing references from the primary record", async () => {
    const getRecord = vi.fn(async (key: string) => {
      if (key === "project") return { name: "Launch", client: "c1" };
      throw new Error("Forbidden");
    });
    const result = await loadRecordDetails(type, "p1", getRecord, [type]);
    expect(result.record?.name).toBe("Launch");
    expect(result.references.client).toEqual({ label: "Unavailable" });
    expect((await loadRecordDetails(type, "missing", async () => null, [type])).record).toBeNull();
  });

  it("ignores late results after selection changes and clears errors on retry", async () => {
    const loader = new RecordLoader();
    let resolve!: (value: Record<string, unknown>) => void;
    const first = loader.load(
      type,
      "first",
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      [type],
    );
    expect(loader.loading).toBe(true);
    await loader.load(type, "second", async () => ({ name: "New selection" }), [type]);
    resolve({ name: "Old selection" });
    await first;
    expect(loader.record?.name).toBe("New selection");
    expect(loader.loading).toBe(false);
    await loader.load(
      type,
      "failure",
      async () => {
        throw new Error("Offline");
      },
      [type],
    );
    expect(loader.error).toContain("Couldn't load");
    expect(loader.record).toBeNull();
    await loader.load(type, "retry", async () => ({ name: "Recovered" }), [type]);
    expect(loader.error).toBeNull();
    expect(loader.record?.name).toBe("Recovered");
  });

  it("does not publish results after the owning component is closed", async () => {
    const loader = new RecordLoader();
    let resolve!: (value: Record<string, unknown>) => void;
    const pending = loader.load(
      type,
      "first",
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      [type],
    );
    loader.cancel();
    resolve({ name: "Stale" });
    await pending;
    expect(loader.record).toBeNull();
  });
});
