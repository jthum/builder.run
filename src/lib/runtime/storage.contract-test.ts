import { describe, expect, it } from "vite-plus/test";
import { normalizeSpec, type TypeDef } from "./model.ts";
import type { PlatformState } from "./platform.ts";
import type { RuntimePersistence, RuntimeStore } from "./storage.ts";

type PersistenceFactory = () => Promise<RuntimePersistence> | RuntimePersistence;

function taskType(): TypeDef {
  return normalizeSpec({
    key: "contract",
    label: "Contract",
    types: {
      task: {
        fields: {
          title: "text",
          priority: "number",
          status: "text",
        },
      },
    },
  }).types[0]!;
}

async function materialize(store: RuntimeStore, types: TypeDef[]): Promise<void> {
  await store.schema.prepare(types);
  await store.schema.apply(types);
  await store.schema.prune(types);
}

export function runtimePersistenceContract(label: string, create: PersistenceFactory): void {
  describe(`${label} persistence contract`, () => {
    it("persists and queries records through logical definitions", async () => {
      const persistence = await create();
      try {
        const store = await persistence.openStore("record-contract");
        const type = taskType();
        await materialize(store, [type]);
        const first = await store.records.create(type, {
          title: "First",
          priority: 1,
          status: "open",
        });
        const second = await store.records.create(type, {
          title: "Second",
          priority: 2,
          status: "open",
        });
        await store.records.create(type, {
          title: "Closed",
          priority: 3,
          status: "closed",
        });

        await expect(
          store.records.query(type, {
            filters: [{ field: "status", op: "eq", value: "open" }],
            order: [{ field: "priority", direction: "desc" }],
            limit: 1,
          }),
        ).resolves.toMatchObject([{ id: second.id, title: "Second" }]);

        await store.records.update(type, first.id, { title: "Updated" });
        await expect(store.records.get(type, first.id)).resolves.toMatchObject({
          id: first.id,
          title: "Updated",
        });
        await store.records.delete(type, first.id);
        await expect(store.records.get(type, first.id)).resolves.toBeNull();
      } finally {
        await persistence.wipe();
      }
    });

    it("preserves records across stable type and field renames", async () => {
      const persistence = await create();
      try {
        const store = await persistence.openStore("schema-contract");
        const type = taskType();
        await materialize(store, [type]);
        const record = await store.records.create(type, {
          title: "Keep me",
          priority: 1,
          status: "open",
        });
        const renamed: TypeDef = {
          ...type,
          key: "work_item",
          fields: type.fields.map((field) =>
            field.key === "title" ? { ...field, key: "summary" } : field,
          ),
        };

        await materialize(store, [renamed]);

        await expect(store.records.get(renamed, record.id)).resolves.toMatchObject({
          id: record.id,
          summary: "Keep me",
        });
        await expect(store.schema.inspect()).resolves.toMatchObject({
          collections: expect.arrayContaining([expect.objectContaining({ name: "work_item" })]),
        });
      } finally {
        await persistence.wipe();
      }
    });

    it("round-trips runtime catalog state", async () => {
      const persistence = await create();
      try {
        const catalog = await persistence.openCatalog();
        const spec = normalizeSpec({ key: "home", label: "Home" });
        const platform: PlatformState = {
          version: 1,
          activeSpaceId: "app",
          spaces: [
            {
              id: "account",
              name: "Personal Space",
              actors: [{ id: "actor", name: "You", kind: "human", roles: ["admin"] }],
              spec,
            },
            {
              id: "app",
              name: "Home",
              createdBy: "actor",
              actors: [],
              spec,
            },
          ],
        };

        await expect(catalog.load()).resolves.toBeNull();
        await catalog.save(platform);
        await expect(catalog.load()).resolves.toMatchObject({
          activeSpaceId: "app",
          spaces: [
            expect.objectContaining({ id: "account", name: "Personal Space" }),
            expect.objectContaining({ id: "app", name: "Home", createdBy: "actor" }),
          ],
        });
      } finally {
        await persistence.wipe();
      }
    });
  });
}
