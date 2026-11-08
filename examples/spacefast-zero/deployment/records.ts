import {
  ERROR_CODES,
  FrameworkError,
  resourceConflict,
  resourceNotFound,
  invalidInput,
} from "@jthum/framework/errors";
import {
  projectValues,
  type CollectionDefinition,
  type JsonValue,
  type SourceQueryDefinition,
} from "@jthum/framework/spec";
import type {
  CollectionRecord,
  RecordListPage,
  RecordStore,
  RecordQueryRelation,
} from "@jthum/framework/persistence";
import { executeSourceQuery, type SourceDescriptor } from "@jthum/framework/kernel";
import type {
  DeployedCollection,
  Deployment,
  ZeroReadDatabase,
  ZeroTable,
  ZeroRow,
} from "./model.ts";
import { queryShape } from "./query-shape.ts";
import { readPage, readAll } from "./page.ts";

const unsupported = (message: string) =>
  new FrameworkError({ code: ERROR_CODES.persistenceUnsupported, message });

/** First target slice: the existing logical RecordStore port over deployment-declared Zero tables. */
export class ZeroRecordStore implements RecordStore {
  constructor(
    private readonly db: ZeroReadDatabase,
    private readonly deployment: Deployment,
    private readonly queryRowLimit = 10000,
  ) {}

  private writer(collection: DeployedCollection): ZeroTable {
    const table = this.db[collection.table]!;
    if (!("insert" in table)) throw unsupported("This handler is read-only.");
    return table as ZeroTable;
  }

  async applySchema(workspaceId: string, collections: readonly CollectionDefinition[]) {
    if (
      collections.some(
        (collection) =>
          !this.deployment.collections.some(
            (item) =>
              item.definition.id === collection.id &&
              JSON.stringify(item.definition) === JSON.stringify(collection),
          ),
      )
    )
      throw unsupported("Change the model in Builder.run and deploy it again.");
  }

  private collection(workspaceId: string, collection: CollectionDefinition): DeployedCollection {
    const deployed = this.deployment.collections.find(
      (item) => item.definition.id === collection.id,
    );
    if (!deployed || JSON.stringify(collection) !== JSON.stringify(deployed.definition))
      throw unsupported("This Collection definition is not the deployed model.");
    return deployed;
  }

  private identity(collection: DeployedCollection, id: string, workspaceId: string) {
    return this.db[collection.table]!.withIndex("by_identity", (range) =>
      range.eq("fw_workspace", workspaceId).eq("fw_id", id),
    );
  }

  private encode(collection: DeployedCollection, record: CollectionRecord, workspaceId: string) {
    if (record.collectionId !== collection.definition.id)
      throw invalidInput("Record Collection does not match.");
    const output: Record<string, unknown> = {
      fw_workspace: workspaceId,
      fw_id: record.id,
      fw_created: record.createdAt,
      fw_updated: record.updatedAt,
      fw_creator: record.createdBy,
      fw_editor: record.updatedBy,
      fw_nulls: JSON.stringify(
        collection.definition.fields
          .filter((field) => record.values[field.key] === null)
          .map((field) => field.id),
      ),
    };
    for (const field of collection.fields) {
      const definition = collection.definition.fields.find((item) => item.id === field.id)!;
      const value = record.values[definition.key];
      if (value != null && !field.json && typeof value !== field.storage)
        throw invalidInput(`Invalid scalar value for ${definition.label}.`);
      output[field.column] = value == null ? null : field.json ? JSON.stringify(value) : value;
    }
    return output;
  }

  private decode(collection: DeployedCollection, row: ZeroRow): CollectionRecord {
    const nulls = new Set<string>(JSON.parse(row.fw_nulls as string));
    const values: Record<string, JsonValue> = {};
    for (const field of collection.fields) {
      const definition = collection.definition.fields.find((item) => item.id === field.id)!;
      const value = row[field.column];
      if (nulls.has(field.id)) values[definition.key] = null;
      else if (value != null)
        values[definition.key] = field.json ? JSON.parse(value as string) : (value as JsonValue);
    }
    return {
      id: row.fw_id as string,
      collectionId: collection.definition.id,
      values,
      createdAt: row.fw_created as string,
      updatedAt: row.fw_updated as string,
      createdBy: row.fw_creator as string,
      updatedBy: row.fw_editor as string,
    };
  }

  async create(workspaceId: string, definition: CollectionDefinition, record: CollectionRecord) {
    const collection = this.collection(workspaceId, definition);
    if (await this.identity(collection, record.id, workspaceId).first())
      throw resourceConflict("Record already exists.");
    await this.writer(collection).insert(this.encode(collection, record, workspaceId));
  }

  async get(workspaceId: string, definition: CollectionDefinition, recordId: string) {
    const collection = this.collection(workspaceId, definition);
    const row = await this.identity(collection, recordId, workspaceId).first();
    return row ? this.decode(collection, row) : null;
  }

  async getMany(
    workspaceId: string,
    definition: CollectionDefinition,
    recordIds: readonly string[],
  ) {
    const records: CollectionRecord[] = [];
    for (const id of recordIds) {
      const record = await this.get(workspaceId, definition, id);
      if (record) records.push(record);
    }
    return records;
  }

  private planned(
    workspaceId: string,
    definition: CollectionDefinition,
    query: SourceQueryDefinition,
  ) {
    const collection = this.collection(workspaceId, definition);
    const shape = queryShape(query);
    const plan = collection.plans.find((item) => item.shape === shape);
    if (!plan) throw unsupported("This query has no supported deployed index plan.");
    for (const value of [query.limit, query.offset])
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw invalidInput("Query bounds must be non-negative integers.");
    for (const selection of query.select ?? []) {
      if (selection.path.length !== 1)
        throw unsupported("This query plan does not include relationship projection.");
      if (!definition.fields.some((field) => field.id === selection.path[0]))
        throw invalidInput("Unknown projection Field.");
    }
    const selected = () =>
      this.db[collection.table]!.withIndex(plan.index, (range) => {
        let restriction = range.eq("fw_workspace", workspaceId);
        if (query.filter && "path" in query.filter) {
          const filter = query.filter;
          const field = collection.fields.find((item) => item.id === filter.path[0])!;
          if (filter.value == null || typeof filter.value !== field.storage)
            throw unsupported("This index plan requires a non-null scalar restriction.");
          const op = filter.operator as "eq" | "gt" | "gte" | "lt" | "lte";
          restriction = restriction[op](field.column, filter.value);
        }
        return restriction;
      }).order(query.sort?.[0]?.direction ?? "asc");
    return { collection, selected };
  }

  async query(workspaceId: string, definition: CollectionDefinition, query: SourceQueryDefinition) {
    if (!this.nativePlan(definition, query)) return this.evaluate(workspaceId, definition, query);
    const { collection, selected } = this.planned(workspaceId, definition, query);
    const total = await selected().count();
    const rows =
      query.limit === undefined
        ? await readAll(selected, this.queryRowLimit)
        : query.limit === 0
          ? []
          : await readPage(selected, query.limit, query.offset ?? 0);
    const offset = query.limit === undefined ? (query.offset ?? 0) : 0;
    return {
      total,
      rows: rows.slice(offset).map((row) => {
        const record = this.decode(collection, row);
        return {
          id: record.id,
          values: query.select
            ? projectValues(query.select, (path) => {
                const field = definition.fields.find((item) => item.id === path[0])!;
                return record.values[field.key];
              })
            : record.values,
        };
      }),
    };
  }

  async list(workspaceId: string, definition: CollectionDefinition, page?: RecordListPage) {
    const { collection, selected } = this.planned(workspaceId, definition, page ?? {});
    const rows = page
      ? await readPage(selected, page.limit, page.offset ?? 0)
      : await readAll(selected, this.queryRowLimit);
    return rows.map((row) => this.decode(collection, row));
  }

  async listFiltered(
    workspaceId: string,
    definition: CollectionDefinition,
    filter: NonNullable<SourceQueryDefinition["filter"]>,
    page?: RecordListPage,
  ) {
    if (!this.nativePlan(definition, { filter })) {
      const records = await this.all(workspaceId, definition);
      const result = await this.evaluate(workspaceId, definition, { filter, ...page }, [], records);
      const byId = new Map(records.map((record) => [record.id, record]));
      return result.rows.map((row) => byId.get(row.id)!);
    }
    const { collection, selected } = this.planned(workspaceId, definition, { filter, ...page });
    const rows = page
      ? await readPage(selected, page.limit, page.offset ?? 0)
      : await readAll(selected, this.queryRowLimit);
    return rows.map((row) => this.decode(collection, row));
  }

  async update(workspaceId: string, definition: CollectionDefinition, record: CollectionRecord) {
    const collection = this.collection(workspaceId, definition);
    const row = await this.identity(collection, record.id, workspaceId).first();
    if (!row) throw resourceNotFound("Record", record.id);
    if (
      !(await this.writer(collection).update(row.id, this.encode(collection, record, workspaceId)))
    )
      throw resourceNotFound("Record", record.id);
  }

  async delete(workspaceId: string, definition: CollectionDefinition, recordId: string) {
    const collection = this.collection(workspaceId, definition);
    const row = await this.identity(collection, recordId, workspaceId).first();
    if (!row || !(await this.writer(collection).delete(row.id)))
      throw resourceNotFound("Record", recordId);
  }

  private nativePlan(definition: CollectionDefinition, query: SourceQueryDefinition): boolean {
    const compiled = this.deployment.collections.find(
      (item) => item.definition.id === definition.id,
    );
    if (!compiled?.plans.some((plan) => plan.shape === queryShape(query))) return false;
    // Text collation and nullable ordering follow the canonical evaluator rather than host defaults.
    const scalar = (path: readonly string[], required: boolean) =>
      definition.fields.some(
        (field) =>
          field.id === path[0] &&
          (field.type === "number" || field.type === "boolean") &&
          (!required || field.required),
      );
    const filter = query.filter && "path" in query.filter ? query.filter : undefined;
    return (
      (!filter || scalar(filter.path, filter.operator !== "eq")) &&
      (query.sort ?? []).every((sort) => scalar(sort.path, true)) &&
      (query.select ?? []).every((selection) => selection.path.length === 1)
    );
  }

  private async all(
    workspaceId: string,
    definition: CollectionDefinition,
  ): Promise<CollectionRecord[]> {
    const { collection, selected } = this.planned(workspaceId, definition, {});
    const rows = await readPage(selected, this.queryRowLimit + 1);
    if (rows.length > this.queryRowLimit)
      throw unsupported(
        `This target query exceeds its ${this.queryRowLimit}-row evaluation budget.`,
      );
    return rows.map((row) => this.decode(collection, row));
  }

  private source(definition: CollectionDefinition): SourceDescriptor {
    return {
      key: definition.key,
      label: definition.label,
      kind: "collection",
      schema: definition,
      capabilities: {
        filter: true,
        sort: true,
        pagination: true,
        relations: true,
        aggregate: true,
        suggestions: false,
      },
    };
  }

  private async evaluate(
    workspaceId: string,
    definition: CollectionDefinition,
    query: SourceQueryDefinition,
    relations: readonly RecordQueryRelation[] = [],
    records?: readonly CollectionRecord[],
  ) {
    const result = await executeSourceQuery(
      this.source(definition),
      records ?? (await this.all(workspaceId, definition)),
      query,
      {
        resolve: async (sourceId, ids) => {
          const relation = relations.find((item) => {
            const parent =
              item.path.length === 1
                ? definition
                : relations.find(
                    (candidate) =>
                      JSON.stringify(candidate.path) === JSON.stringify(item.path.slice(0, -1)),
                  )?.collection;
            const field = parent?.fields.find((field) => field.id === item.path.at(-1));
            return field?.type === "reference" && field.sourceId === sourceId;
          });
          if (!relation) throw unsupported("Relationship query lacks an authorized target plan.");
          const candidates = await this.getMany(relation.workspaceId, relation.collection, ids);
          const visible = relation.filter
            ? (
                await executeSourceQuery(this.source(relation.collection), candidates, {
                  filter: relation.filter,
                })
              ).rows
            : candidates;
          return { schema: relation.collection, rows: visible, traversable: true };
        },
      },
    );
    return { rows: result.rows, total: result.total };
  }

  queryRelated(
    workspaceId: string,
    definition: CollectionDefinition,
    query: SourceQueryDefinition,
    relations: readonly RecordQueryRelation[],
  ) {
    return this.evaluate(workspaceId, definition, query, relations);
  }
}
