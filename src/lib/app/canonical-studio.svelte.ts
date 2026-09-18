import { session } from "$lib/app/session.svelte.ts";
import {
  createCollection,
  createCollectionActions,
  createFormActions,
  createPageActions,
  createRule,
  createRuleActions,
  isStudioManaged,
  createViewActions,
  loadEditorContext,
  type CollectionActions,
  type EditorContext,
  type FormActions,
  type NewCollectionDraft,
  type NewRuleDraft,
  type PageActions,
  type RuleActions,
  type ViewActions,
  type ViewAuthoringSchemas,
} from "@jthum/framework/svelte/studio";
import type { Spec } from "@jthum/framework/spec";
import { installCollectionStarters } from "$lib/app/collection-starters.ts";

class CanonicalStudioState {
  context = $state.raw<EditorContext | null>(null);
  spaceContext = $state.raw<EditorContext | null>(null);
  spec = $state.raw<Spec | null>(null);
  schemas = $state.raw<ViewAuthoringSchemas>({});
  spaceSchemas = $state.raw<ViewAuthoringSchemas>({});
  pending = $state(false);
  error = $state<string | null>(null);
  revision = $state(0);
  private generation = 0;

  async refresh(): Promise<void> {
    const runtime = session.framework;
    const token = ++this.generation;
    if (!runtime) {
      this.context = null;
      this.spaceContext = null;
      this.spec = null;
      this.schemas = {};
      this.spaceSchemas = {};
      return;
    }
    this.pending = true;
    try {
      const [loaded, space] = await Promise.all([
        loadEditorContext(runtime.appClient),
        loadEditorContext(runtime.spaceClient),
      ]);
      if (token !== this.generation || runtime !== session.framework) return;
      const shared = new Set(loaded.spec.sources.map((source) => source.key));
      this.spec = loaded.spec;
      this.schemas = loaded.schemas;
      this.spaceSchemas = space.schemas;
      this.spaceContext = space.context;
      this.context = {
        ...loaded.context,
        collections: loaded.context.collections.map((collection) => ({
          ...collection,
          expose: shared.has(collection.key),
        })),
      };
      this.error = null;
      this.revision += 1;
    } catch (error) {
      if (token === this.generation)
        this.error = error instanceof Error ? error.message : "Unable to load Studio data.";
    } finally {
      if (token === this.generation) this.pending = false;
    }
  }

  actions(): CollectionActions {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createCollectionActions(runtime.appClient, {
      schemas: this.schemas,
      onChange: () => this.refresh(),
    });
  }

  spaceActions(): CollectionActions {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createCollectionActions(runtime.spaceClient, {
      schemas: this.spaceSchemas,
      onChange: () => this.refresh(),
    });
  }

  viewActions(): ViewActions {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createViewActions(runtime.appClient, {
      schemas: this.schemas,
      onChange: () => this.refresh(),
    });
  }

  formActions(): FormActions {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createFormActions(runtime.appClient, {
      sources: this.context?.collections ?? [],
      onChange: () => this.refresh(),
    });
  }

  ruleActions(): RuleActions {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createRuleActions(runtime.appClient, {
      schemas: this.schemas,
      onChange: () => this.refresh(),
    });
  }

  pageActions(): PageActions {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createPageActions(runtime.appClient, {
      include: (page) =>
        page.key !== "home" && page.meta?.path !== "/" && !isStudioManaged(page.meta),
      onChange: () => this.refresh(),
    });
  }

  async queryView(key: string): Promise<Array<Record<string, unknown>>> {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await runtime.appClient.queryView(key);
    return result.data.rows.map((row) => ({ id: row.id, ...row.values }));
  }

  async queryViewWith(
    key: string,
    parameters: Record<string, string> = {},
  ): Promise<Array<Record<string, unknown>>> {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await runtime.appClient.queryView(key, { parameters });
    return result.data.rows.map((row) => ({ id: row.id, ...row.values }));
  }

  async getRecord(collectionKey: string, id: string): Promise<Record<string, unknown> | null> {
    const client = this.recordClient(collectionKey);
    const record = await client.getRecord(collectionKey, id);
    return record ? this.recordValue(record) : null;
  }

  async listRecords(collectionKey: string): Promise<Array<Record<string, unknown>>> {
    const collection = this.context?.collections.find((item) => item.key === collectionKey);
    const runtime = session.framework;
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
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const result = await runtime.appClient.submitForm(key, {
      values: values as never,
      ...(recordId ? { recordId } : {}),
    });
    this.revision += 1;
    return result.mode === "standalone" ? null : this.recordValue(result.record);
  }

  async runRule(key: string, input: Record<string, unknown>): Promise<void> {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    await runtime.appClient.runRule(key, input as never);
    this.revision += 1;
  }

  private recordClient(collectionKey: string) {
    const runtime = session.framework;
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

  async createRule(draft: NewRuleDraft) {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    return createRule(runtime.appClient, draft, {
      schemas: this.schemas,
      onChange: () => this.refresh(),
    });
  }

  async createCollection(draft: NewCollectionDraft) {
    const runtime = session.framework;
    if (!runtime) throw new Error("The Framework runtime is not ready.");
    const collection = await createCollection(runtime.appClient, draft, { schemas: this.schemas });
    const loaded = await loadEditorContext(runtime.appClient);
    await installCollectionStarters(runtime.appClient, collection, loaded.schemas);
    await this.refresh();
    return collection;
  }
}

export const canonicalStudio = new CanonicalStudioState();
