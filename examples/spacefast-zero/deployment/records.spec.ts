import { describe, expect, it } from "vite-plus/test";
import { compileDeployment } from "./compile.ts";
import { fixture } from "./fixture.ts";
import { ZeroRecordStore } from "./records.ts";
import { database } from "../testing/database.ts";

const record = (id: string, priority: number, open = true) => ({
  id,
  collectionId: "deployment_tasks",
  values: { title: id, priority, open, details: { nested: [1, true, null] } },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "actor",
  updatedBy: "actor",
});

describe("deployment-generated Zero RecordStore", () => {
  it("preserves native scalars, structured values, explicit nulls, absent fields and logical IDs", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(2), "workspace");
      const collection = deployment.spec.collections[0]!;
      const store = new ZeroRecordStore(db.install(deployment), deployment);
      const input = {
        ...record("record-a", 2),
        values: {
          name: "Write tests",
          priority: 2,
          open: false,
          details: { a: [null, true] },
          notes: null,
        },
      };
      await store.create("workspace", collection, input);
      expect(await store.getMany("workspace", collection, [input.id, "missing", input.id])).toEqual(
        [input, input],
      );
      const physical = deployment.collections[0]!;
      const number = physical.fields.find((field) => field.id === "task_priority")!.column;
      expect(
        db.sql.prepare(`SELECT typeof("${number}") AS type FROM "${physical.table}"`).get()?.type,
      ).toBe("real");
      await store.update("workspace", collection, {
        ...input,
        values: { name: "Updated", priority: 3 },
      });
      expect((await store.get("workspace", collection, input.id))?.values).toEqual({
        name: "Updated",
        priority: 3,
      });
      await expect(store.create("workspace", collection, input)).rejects.toMatchObject({
        code: "RESOURCE.CONFLICT",
      });
      expect(await store.get("another", collection, input.id)).toBeNull();
      await store.delete("workspace", collection, input.id);
      expect(await store.get("workspace", collection, input.id)).toBeNull();
    } finally {
      db.sql.close();
    }
  });

  it("uses indexed storage queries and canonical evaluation for grouped queries", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(1), "workspace");
      const collection = deployment.spec.collections[0]!;
      const store = new ZeroRecordStore(db.install(deployment), deployment);
      for (const input of [
        record("one", 1),
        record("three", 3),
        record("two", 2),
        record("closed", 9, false),
      ])
        await store.create("workspace", collection, input);
      db.traces.length = 0;
      const result = await store.query("workspace", collection, {
        ...deployment.spec.views[0]!.query,
        offset: 1,
        limit: 1,
        select: [{ path: ["task_title"], as: "label" }],
      });
      expect(result).toEqual({ total: 3, rows: [{ id: "two", values: { label: "two" } }] });
      expect(db.traces).toHaveLength(3);
      expect(db.traces[0]).toContain("COUNT(*)");
      expect(db.traces[1]).toMatch(/ desc/i);
      expect(db.traces[1]).toContain("LIMIT 2");
      expect(db.traces.every((trace) => trace.includes(" WHERE ") && trace.includes(" AND "))).toBe(
        true,
      );
      const grouped = await store.query("workspace", collection, {
        aggregate: {
          group: { path: ["task_open"], as: "open" },
          measures: [{ as: "count", operation: "count" }],
        },
      });
      expect(grouped.rows.map((row) => row.values)).toEqual(
        expect.arrayContaining([
          { open: true, count: 3 },
          { open: false, count: 1 },
        ]),
      );
      expect((await store.query("workspace", collection, { limit: 0 })).rows).toEqual([]);
      const constrained = new ZeroRecordStore(db.install(deployment), deployment, 2);
      await expect(
        constrained.query("workspace", collection, {
          aggregate: {
            group: { path: ["task_open"], as: "open" },
            measures: [{ operation: "count", as: "count" }],
          },
        }),
      ).rejects.toMatchObject({ code: "PERSISTENCE.UNSUPPORTED" });
    } finally {
      db.sql.close();
    }
  });

  it("keeps physical identity and records across a key rename and an additive deployment", async () => {
    const db = database();
    try {
      const first = compileDeployment(fixture(1), "workspace");
      const second = compileDeployment(fixture(2), "workspace");
      expect(second.deployment.collections[0]!.table).toBe(first.deployment.collections[0]!.table);
      expect(second.deployment.collections[0]!.fields.slice(0, 4)).toEqual(
        first.deployment.collections[0]!.fields,
      );
      expect(first.deployment.collections[0]!.plans).toHaveLength(3);
      const original = new ZeroRecordStore(db.install(first.deployment), first.deployment);
      await original.create("workspace", first.deployment.spec.collections[0]!, record("kept", 2));
      const updated = new ZeroRecordStore(db.install(second.deployment), second.deployment);
      const collection = second.deployment.spec.collections[0]!;
      expect((await updated.get("workspace", collection, "kept"))?.values).toEqual({
        name: "kept",
        priority: 2,
        open: true,
        details: { nested: [1, true, null] },
      });
      await expect(
        updated.applySchema("workspace", first.deployment.spec.collections),
      ).rejects.toMatchObject({ code: "PERSISTENCE.UNSUPPORTED" });
      await updated.applySchema("workspace", second.deployment.spec.collections);
    } finally {
      db.sql.close();
    }
  });
});
