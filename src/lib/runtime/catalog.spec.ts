import { describe, expect, it } from "vite-plus/test";
import { CATALOG_DATABASE } from "./catalog.ts";
import { Host } from "./host.ts";
import { createNodeGateway } from "./sql-node.ts";

describe("catalog schema", () => {
  it("rebuilds leftover actor tables that have no space_id", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const conn = await gateway.open(CATALOG_DATABASE);
    await conn.exec(
      `CREATE TABLE br_actor (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, roles TEXT NOT NULL)`,
    );
    const host = await Host.open({ gateway, persist: false });
    expect(host.actor().name).toBe("You");
    expect(host.snapshot().catalog.tables).toEqual(["actor", "kv", "space"]);
  });

  it("rebuilds a new-named actor table missing space_id", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const conn = await gateway.open(CATALOG_DATABASE);
    await conn.exec(
      `CREATE TABLE space (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT,
        spec TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    );
    await conn.exec(
      `CREATE TABLE actor (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, roles TEXT NOT NULL)`,
    );
    const host = await Host.open({ gateway, persist: false });
    expect(host.space().name).toBe("Personal Space");
    expect(host.snapshot().catalog.tables).toEqual(["actor", "kv", "space"]);
  });
});
