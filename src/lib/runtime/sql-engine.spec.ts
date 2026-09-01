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
        { key: "name", type: "text", label: "Name", id: "fld_name" },
        { key: "budget", type: "number", label: "Budget", id: "fld_budget" },
        { key: "active", type: "boolean", label: "Active", id: "fld_active" },
      ] as never,
    });
    const info = await host.inspectStore("local");
    const project = info.tables.find((table) => table.name === "project");
    expect(project).toBeTruthy();
    expect(project?.columns.some((column) => column.startsWith("name "))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("budget REAL"))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("active INTEGER"))).toBe(true);
    expect(project?.columns.some((column) => column.startsWith("id TEXT"))).toBe(true);
    const created = await host.create("project", { name: "Acme site", budget: 8000, active: true });
    expect(created.name).toBe("Acme site");
    expect(created.budget).toBe(8000);
    expect(created.active).toBe(true);
    const directory = await host.inspectStore("directory");
    expect(directory.tables.some((table) => table.name === "organisation")).toBe(true);
  });

  it("emits readable CREATE TABLE SQL", () => {
    expect.hasAssertions();
    const sql = createTableSql("project", [
      { name: "name", sqlType: "TEXT" },
      { name: "budget", sqlType: "REAL" },
    ]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "project"');
    expect(sql).toContain('"id" TEXT PRIMARY KEY');
    expect(sql).toContain('"budget" REAL');
    expect(sql).toContain("STRICT");
  });
});
