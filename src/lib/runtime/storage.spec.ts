import { describe, expect, it } from "vite-plus/test";
import { matchFilters } from "./filters.ts";
import { normalizeSpec, type RecordValue, type TypeDef } from "./model.ts";
import { executeView, PortableQueryExecutor, type QueryContext } from "./query.ts";
import type { RecordQueryPlan, RecordStore } from "./storage.ts";

class MemoryRecordStore implements RecordStore {
  readonly name = "memory-records";
  lastPlan?: RecordQueryPlan;
  getCount = 0;

  constructor(private readonly rows: RecordValue[]) {}

  async create(_type: TypeDef, values: Record<string, unknown>): Promise<RecordValue> {
    const record = values as RecordValue;
    this.rows.push(record);
    return record;
  }

  async update(_type: TypeDef, id: string, values: Record<string, unknown>): Promise<void> {
    Object.assign(this.rows.find((row) => row.id === id) ?? {}, values);
  }

  async delete(_type: TypeDef, id: string): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index >= 0) this.rows.splice(index, 1);
  }

  async get(_type: TypeDef, id: string): Promise<RecordValue | null> {
    this.getCount += 1;
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async query(_type: TypeDef, plan: RecordQueryPlan = {}): Promise<RecordValue[]> {
    this.lastPlan = plan;
    const rows = this.rows.filter((row) => matchFilters(row, plan.filters ?? []));
    for (const order of [...(plan.order ?? [])].reverse()) {
      rows.sort((left, right) => {
        const compared = String(left[order.field]).localeCompare(
          String(right[order.field]),
          undefined,
          {
            numeric: true,
          },
        );
        return order.direction === "desc" ? -compared : compared;
      });
    }
    return rows.slice(0, plan.limit ?? rows.length);
  }
}

function row(id: string, title: string, priority: number, status: string): RecordValue {
  return {
    id,
    title,
    priority,
    status,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: "actor",
    updated_by: "actor",
  };
}

describe("portable storage boundaries", () => {
  it("executes a view through a logical record store and query plan", async () => {
    const spec = normalizeSpec({
      key: "tasks",
      label: "Tasks",
      types: {
        task: {
          fields: {
            title: "text",
            priority: "number",
            status: "text",
          },
        },
      },
      views: {
        open_tasks: {
          source: "task",
          fields: ["title", "priority"],
          where: { status: "open" },
          order_by: { priority: "desc" },
          limit: 1,
        },
      },
    });
    const store = new MemoryRecordStore([
      row("1", "First", 1, "open"),
      row("2", "Second", 2, "open"),
      row("3", "Closed", 3, "closed"),
    ]);
    const context: QueryContext = {
      spec,
      sharedTypes: [],
      recordsFor: () => store,
      queries: new PortableQueryExecutor(),
    };

    await expect(executeView(context, spec.views[0]!)).resolves.toMatchObject([
      { id: "2", title: "Second", priority: 2 },
    ]);
    expect(store.lastPlan).toEqual({
      filters: [{ field: "status", op: "eq", value: "open" }],
      order: [{ field: "priority", direction: "desc" }],
      limit: 1,
    });
  });

  it("reuses related-record lookups within one query execution", async () => {
    const spec = normalizeSpec({
      key: "projects",
      label: "Projects",
      types: {
        person: { fields: { name: "text" } },
        project: {
          fields: {
            title: "text",
            owner: { type: "reference", target: "person" },
          },
        },
      },
      views: {
        projects: {
          source: "project",
          fields: ["title", "owner.name"],
        },
      },
    });
    const people = new MemoryRecordStore([{ ...row("person-1", "", 0, ""), name: "Ada" }]);
    const projects = new MemoryRecordStore([
      { ...row("project-1", "One", 0, ""), owner: "person-1" },
      { ...row("project-2", "Two", 0, ""), owner: "person-1" },
    ]);
    const context: QueryContext = {
      spec,
      sharedTypes: [],
      recordsFor: (type) => (type.key === "person" ? people : projects),
      queries: new PortableQueryExecutor(),
    };

    await expect(executeView(context, spec.views[0]!)).resolves.toMatchObject([
      { title: "One", "owner.name": "Ada" },
      { title: "Two", "owner.name": "Ada" },
    ]);
    expect(people.getCount).toBe(1);
  });
});
