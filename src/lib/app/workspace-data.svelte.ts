import type { WorkspaceClient } from "@jthum/framework/client";
import { launchRule, type RuleLaunch } from "@jthum/framework/client";
import {
  viewDefinitionFromDraft,
  type ViewDraft,
  type EditorContext,
  type ViewAuthoringSchemas,
} from "@jthum/framework/svelte/authoring/data";
import type { Spec } from "@jthum/framework/spec";
import { relatedRecordQuery } from "./record-details.ts";

/** Shared record/form/view bindings. Each host supplies its authenticated Workspace clients. */
export abstract class WorkspaceData {
  context = $state.raw<EditorContext | null>(null);
  spec = $state.raw<Spec | null>(null);
  schemas = $state.raw<ViewAuthoringSchemas>({});
  revision = $state(0);
  protected abstract runtime(): { appClient: WorkspaceClient; spaceClient: WorkspaceClient } | null;
  async queryView(key: string): Promise<Array<Record<string, unknown>>> {
    const runtime = this.runtime();
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await runtime.appClient.queryView(key);
    return result.data.rows.map((row) => ({ id: row.id, ...row.values }));
  }

  async queryViewWith(
    key: string,
    parameters: Record<string, string> = {},
  ): Promise<Array<Record<string, unknown>>> {
    const runtime = this.runtime();
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await runtime.appClient.queryView(key, { parameters });
    return result.data.rows.map((row) => ({ id: row.id, ...row.values }));
  }

  async queryRelatedRecords(
    view: ViewDraft,
    fieldKey: string,
    id: string,
  ): Promise<Array<Record<string, unknown>>> {
    const runtime = this.runtime();
    const field = this.schemas[view.source]?.fields.find((field) => field.key === fieldKey);
    if (!runtime || !field) throw new Error("The related collection is unavailable.");
    const definition = viewDefinitionFromDraft(view, this.schemas);
    const result = await runtime.appClient.querySource(
      definition.source,
      relatedRecordQuery(definition, field.id, id),
    );
    return result.rows.map((row) => ({ id: row.id, ...row.values }));
  }

  async getRecord(collectionKey: string, id: string): Promise<Record<string, unknown> | null> {
    return this.recordReader()(collectionKey, id);
  }

  /** Bind related reads to the same App/Space even if the user switches Apps mid-request. */
  recordReader() {
    const runtime = this.runtime();
    const collections = this.context?.collections ?? [];
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return async (key: string, id: string): Promise<Record<string, unknown> | null> => {
      const collection = collections.find((item) => item.key === key);
      if (!collection) throw new Error(`Collection ${key} is unavailable.`);
      const client = collection.expose ? runtime.spaceClient : runtime.appClient;
      const record = await client.getRecord(key, id);
      return record ? this.recordValue(record) : null;
    };
  }

  async listRecords(collectionKey: string): Promise<Array<Record<string, unknown>>> {
    const collection = this.context?.collections.find((item) => item.key === collectionKey);
    const runtime = this.runtime();
    if (!runtime || !collection) throw new Error(`Collection ${collectionKey} is unavailable.`);
    if (collection.expose) {
      const result = await runtime.appClient.querySource(collectionKey);
      return result.rows.map((row) => ({ id: row.id, ...row.values }));
    }
    return (await runtime.appClient.listRecords(collectionKey)).map((record) =>
      this.recordValue(record),
    );
  }

  async createRecord(
    collectionKey: string,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const record = await this.recordClient(collectionKey).createRecord(
      collectionKey,
      values as never,
    );
    this.revision += 1;
    return this.recordValue(record);
  }

  async updateRecord(
    collectionKey: string,
    id: string,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const record = await this.recordClient(collectionKey).updateRecord(
      collectionKey,
      id,
      values as never,
    );
    this.revision += 1;
    return this.recordValue(record);
  }

  async deleteRecord(collectionKey: string, id: string): Promise<void> {
    await this.recordClient(collectionKey).deleteRecord(collectionKey, id);
    this.revision += 1;
  }

  async submitForm(
    key: string,
    values: Record<string, unknown>,
    recordId?: string,
  ): Promise<Record<string, unknown> | null> {
    const runtime = this.runtime();
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await runtime.appClient.submitForm(key, {
      values: values as never,
      ...(recordId ? { recordId } : {}),
    });
    this.revision += 1;
    return result.mode === "standalone" ? null : this.recordValue(result.record);
  }

  async runRule(key: string, input: Record<string, unknown>): Promise<RuleLaunch> {
    const runtime = this.runtime();
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await launchRule(runtime.appClient, key, { input: input as never });
    this.revision += 1;
    return result;
  }

  private recordClient(collectionKey: string) {
    const runtime = this.runtime();
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const collection = this.context?.collections.find((item) => item.key === collectionKey);
    if (!collection) throw new Error(`Collection ${collectionKey} is unavailable.`);
    return collection.expose ? runtime.spaceClient : runtime.appClient;
  }

  private recordValue(record: {
    id: string;
    values: Readonly<Record<string, unknown>>;
    createdAt: string;
    updatedAt: string;
  }): Record<string, unknown> {
    return {
      id: record.id,
      ...record.values,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }
}
