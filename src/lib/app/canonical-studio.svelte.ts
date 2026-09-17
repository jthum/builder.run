import { session } from "$lib/app/session.svelte.ts";
import {
  createCollection,
  createCollectionActions,
  createFormActions,
  createRule,
  createRuleActions,
  createViewActions,
  loadEditorContext,
  type CollectionActions,
  type EditorContext,
  type FormActions,
  type NewCollectionDraft,
  type NewRuleDraft,
  type RuleActions,
  type ViewActions,
  type ViewAuthoringSchemas,
} from "@jthum/framework/svelte/studio";
import type { Spec } from "@jthum/framework/spec";

class CanonicalStudioState {
  context = $state.raw<EditorContext | null>(null);
  spec = $state.raw<Spec | null>(null);
  schemas = $state.raw<ViewAuthoringSchemas>({});
  pending = $state(false);
  error = $state<string | null>(null);
  revision = $state(0);
  private generation = 0;

  async refresh(): Promise<void> {
    const runtime = session.framework;
    const token = ++this.generation;
    if (!runtime) {
      this.context = null;
      this.spec = null;
      this.schemas = {};
      return;
    }
    this.pending = true;
    try {
      const loaded = await loadEditorContext(runtime.appClient);
      if (token !== this.generation || runtime !== session.framework) return;
      const shared = new Set(loaded.spec.sources.map((source) => source.key));
      this.spec = loaded.spec;
      this.schemas = loaded.schemas;
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
    const collection = await createCollection(runtime.appClient, draft, {
      schemas: this.schemas,
      onChange: () => this.refresh(),
    });
    return collection;
  }
}

export const canonicalStudio = new CanonicalStudioState();
