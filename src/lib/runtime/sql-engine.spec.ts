import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { createTableSql } from "./sql.ts";

describe("sqlite materialisation", () => {
  it("creates real tables and columns from a type", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "project",
      fields: [
        { key: "name", type: "text", label: "Name", id: "A000000000000009" },
        { key: "budget", type: "number", label: "Budget", id: "A000000000000005" },
        { key: "active", type: "boolean", label: "Active", id: "A000000000000004" },
        {
          key: "parent",
          type: "reference",
          target: "project",
          label: "Parent",
          id: "A000000000000003",
        },
      ] as never,
    });
    const info = await host.inspectStore("local");
    const project = info.tables.find((table) => table.name === "project");
    expect(project).toBeTruthy();
    expect(project?.columns.some((column) => column.startsWith("name "))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("budget REAL"))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("active INTEGER"))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("parent INTEGER"))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("id INTEGER"))).toBe(true);
    const created = await host.create("project", { name: "Acme site", budget: 8000, active: true });
    const next = await host.create("project", { name: "Next site", budget: 4000, active: false });
    expect(created.id).toBe("1");
    expect(next.id).toBe("2");
    await host.remove("project", next.id);
    const afterDelete = await host.create("project", { name: "Later site" });
    expect(afterDelete.id).toBe("3");
    expect(created.name).toBe("Acme site");
    expect(created.budget).toBe(8000);
    expect(created.active).toBe(true);
    const shared = await host.inspectStore("space");
    expect(shared.database).toBe(`space-${host.space().id}`);
    expect(shared.database).not.toContain("-shared");
    expect(shared.database).not.toContain("spc_");
    expect(host.space().id.startsWith("spc_")).toBe(false);
    expect(info.database).toBe(`space-${host.app().id}`);
    expect(shared.database).not.toBe(info.database);
    expect(shared.tables.some((table) => table.name === "_meta")).toBe(true);
    expect(shared.tables.some((table) => table.name === "organisation")).toBe(false);
    expect(info.tables.some((table) => table.name === "_meta")).toBe(true);
    expect(
      info.tables
        .find((table) => table.name === "_meta")
        ?.columns.some((column) => column.startsWith("id TEXT")),
    ).toBe(true);
  });

  it("renames and drops columns without losing other values", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "project",
      fields: [
        { key: "name", type: "text", label: "Name", id: "A000000000000009" },
        { key: "note", type: "text", label: "Note", id: "A00000000000000A" },
      ] as never,
    });
    const created = await host.create("project", { name: "Acme", note: "keep me" });
    await host.renameField("project", "note", "summary");
    let row = await host.getRecord("project", created.id);
    expect(row?.summary).toBe("keep me");
    expect(row?.note).toBeUndefined();
    await host.upsertField("project", {
      key: "priority",
      type: "enum",
      values: ["low", "medium", "high"],
    });
    await host.update("project", created.id, { priority: "high" });
    row = await host.getRecord("project", created.id);
    expect(row?.priority).toBe("high");
    await host.deleteField("project", "summary");
    const info = await host.inspectStore("local");
    const project = info.tables.find((table) => table.name === "project");
    expect(project?.columns.some((column) => column.startsWith("summary "))).toBe(false);
    expect(project?.columns.some((column) => column.startsWith("priority "))).toBe(true);
    row = await host.getRecord("project", created.id);
    expect(row?.name).toBe("Acme");
    expect(row?.priority).toBe("high");
  });

  it("emits readable CREATE TABLE SQL", () => {
    expect.hasAssertions();
    const sql = createTableSql("project", [
      { name: "name", sqlType: "TEXT" },
      { name: "budget", sqlType: "REAL" },
    ]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "project"');
    expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(sql).toContain('"budget" REAL');
    expect(sql).toContain("STRICT");
  });
});
