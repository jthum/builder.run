import {
  CATALOG_DATABASE,
  ensureCatalog,
  listCatalogTables,
  loadPlatform,
  savePlatform,
} from "./catalog.ts";
import { authoredSpec, defaultViewFields, effectiveSpec } from "./defaults.ts";
import { assertValidAutomation } from "./automation/validate.ts";
import type { TableEngine } from "./engine.ts";
import {
  invokeWorkflow,
  matchingEventTriggers,
  matchingTriggers,
  type WorkflowRun,
} from "./workflows.ts";
import { conditionFieldKeys, renameConditionField } from "./field-state.ts";
import { createId, createSpecId, labelFromKey, slugify } from "./ids.ts";
import {
  cloneData,
  cloneSpec,
  normalizeField,
  normalizeFieldKey,
  normalizeSpec,
  normalizeTypeLifecycle,
  normalizeView,
  validateFieldCapabilities,
  type Actor,
  type AppSpec,
  type ExecutionContext,
  type FieldDef,
  type WorkflowDef,
  type FormDef,
  type FormDraft,
  type PageDef,
  type RecordValue,
  type TypeDef,
  type TypeDraft,
  type ViewDef,
  isExposed,
} from "./model.ts";
import { readPlatformJson, type PersistenceBackend } from "./persist.ts";
import {
  SPACE_ACCENT_KEYS,
  type PlatformState,
  type SpaceAccent,
  type SpaceState,
} from "./platform.ts";
import { executeView, findType, type QueryContext, type ViewRunContext } from "./query.ts";
import {
  createRecord,
  decodeRecord,
  deleteRecord,
  prepareFieldValues,
  updateRecord,
  validateFields,
  type ChangeEvent,
} from "./records.ts";
import { newAppSpec, rootSpaceSpec, sampleApps } from "./samples.ts";
import { reconcileStore } from "./schema.ts";
import { specFromText, specToJson, specToYaml } from "./serialize.ts";
import { guessPageIcon, normalizePageIcon } from "./page-icons.ts";
import { configurePageRows, normalizePageRows } from "./widgets.ts";
import { SqliteEngine } from "./sql-engine.ts";
import { scalarString } from "./values.ts";
import { openSqlGateway, type SqlConnection, type SqlGateway } from "./sql-gateway.ts";
import {
  findFieldReferences,
  findTypeReferences,
  rewriteFieldReferences,
  rewriteTypeReferences,
  type SpecReference,
} from "./spec-references.ts";

export type { PlatformState, SpaceState } from "./platform.ts";

export interface HostSnapshot {
  backend: PersistenceBackend;
  engine: "sqlite";
  webmcp: boolean;
  space: SpaceState;
  app: SpaceState;
  spec: AppSpec;
  sharedTypes: TypeDef[];
  actor: Actor;
  spaces: Array<{ id: string; name: string }>;
  apps: Array<{ id: string; name: string }>;
  stores: Array<{ key: string; label: string; database: string; tables: string[] }>;
  catalog: { database: string; tables: string[] };
}

export interface HostOptions {
  gateway?: SqlGateway;
  persist?: boolean;
}

type Listener = () => void;

export class Host {
  backend: PersistenceBackend = "memory";
  private platform!: PlatformState;
  private gateway!: SqlGateway;
  private catalog!: SqlConnection;
  private engines = new Map<string, TableEngine>();
  private listeners = new Set<Listener>();
  private persistEnabled = true;
  private silent = false;
  private storeTables = new Map<string, string[]>();
  private catalogTables: string[] = [];

  static async open(options: HostOptions = {}): Promise<Host> {
    const host = new Host();
    host.persistEnabled = options.persist !== false;
    host.gateway = options.gateway ?? (await openSqlGateway());
    host.backend = host.gateway.backend;
    host.catalog = await host.gateway.open(CATALOG_DATABASE);
    await ensureCatalog(host.catalog);
    const loaded = await loadPlatform(host.catalog);
    if (loaded) {
      host.platform = loaded;
    } else {
      const migrated = host.persistEnabled ? await migrateLegacyJson() : null;
      host.platform = migrated ?? seedPlatform();
    }
    await host.bootEngines();
    await host.reconcileAll();
    await host.saveCatalog();
    return host;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async persistAndEmit(): Promise<void> {
    if (this.silent) return;
    await this.saveCatalog();
    for (const listener of this.listeners) listener();
  }

  private async saveCatalog(): Promise<void> {
    await savePlatform(this.catalog, this.platform);
    this.catalogTables = await listCatalogTables(this.catalog);
  }

  private spaceFile(id: string): string {
    return `space-${id}`;
  }

  private async bootEngines(): Promise<void> {
    this.engines.clear();
    const ids = new Set([this.app().id, this.space().id]);
    for (const id of ids) {
      const name = this.spaceFile(id);
      const conn = await this.gateway.open(name);
      this.engines.set(id, new SqliteEngine(conn, name));
    }
  }

  private async reconcileAll(): Promise<void> {
    const tables = await this.reconcileSpecs(
      this.platform,
      new Set([this.space().id, this.app().id]),
    );
    for (const [id, names] of tables) this.storeTables.set(id, names);
  }

  private async reconcileSpecs(
    platform: PlatformState,
    ids: ReadonlySet<string>,
  ): Promise<Map<string, string[]>> {
    const tables = new Map<string, string[]>();
    for (const id of ids) {
      const engine = this.engines.get(id);
      const target = platform.spaces.find((item) => item.id === id);
      if (!engine || !target) continue;
      await engine.transaction(() => reconcileStore(engine, target.spec.types));
      tables.set(id, await engine.listTables());
    }
    return tables;
  }

  /**
   * Commit authored spec changes as one staged unit. The catalog and record stores
   * are updated before the new platform snapshot becomes observable to callers.
   */
  private async commitSpecs(changes: Array<{ id: string; spec: AppSpec }>): Promise<void> {
    if (!changes.length) return;
    const previous = this.platform;
    const staged = cloneData(previous);
    const changedIds = new Set<string>();

    for (const change of changes) {
      const current = previous.spaces.find((item) => item.id === change.id);
      const target = staged.spaces.find((item) => item.id === change.id);
      if (!current || !target) throw new Error(`Unknown spec owner ${change.id}`);
      target.spec = normalizeSpec(authoredSpec(change.spec));
      changedIds.add(change.id);
    }

    await savePlatform(this.catalog, staged);
    let tables: Map<string, string[]>;
    try {
      tables = await this.reconcileSpecs(staged, changedIds);
    } catch (error) {
      try {
        await savePlatform(this.catalog, previous);
        await this.reconcileSpecs(previous, changedIds);
      } catch (rollbackError) {
        console.error("builder.run failed to restore a spec commit", rollbackError);
      }
      throw error;
    }

    const catalogTables = await listCatalogTables(this.catalog);
    this.platform = staged;
    this.catalogTables = catalogTables;
    for (const [id, names] of tables) this.storeTables.set(id, names);
    if (!this.silent) {
      for (const listener of this.listeners) listener();
    }
  }

  private engineForType(type: TypeDef): TableEngine {
    const appHas = this.app().spec.types.some((item) => item.key === type.key);
    const spaceHas = this.space().spec.types.some((item) => item.key === type.key);
    const id = appHas ? this.app().id : spaceHas ? this.space().id : this.app().id;
    const engine = this.engines.get(id);
    if (!engine) throw new Error(`Store for ${type.key} is not open`);
    return engine;
  }

  /** Account space: the space that holds the current actor. */
  space(): SpaceState {
    const actorId = this.currentActorId();
    return (
      this.platform.spaces.find((item) => item.actors.some((actor) => actor.id === actorId)) ??
      this.app()
    );
  }

  /** The space you are using. An app when createdBy is set. */
  app(): SpaceState {
    const current = this.platform.spaces.find((item) => item.id === this.platform.activeSpaceId);
    if (!current) throw new Error("No active app");
    return current;
  }

  /** Spaces this account created — the app switcher query. */
  apps(): SpaceState[] {
    const actorId = this.actor().id;
    return this.platform.spaces.filter((item) => item.createdBy === actorId);
  }

  private currentActorId(): string | undefined {
    const current = this.app();
    const local = current.actors.find((item) => item.kind === "human") ?? current.actors[0];
    if (local) return local.id;
    if (current.createdBy) return current.createdBy;
    for (const space of this.platform.spaces) {
      const human = space.actors.find((item) => item.kind === "human") ?? space.actors[0];
      if (human) return human.id;
    }
    return undefined;
  }

  actor(): Actor {
    const actorId = this.currentActorId();
    for (const space of this.platform.spaces) {
      const found = space.actors.find((item) => item.id === actorId);
      if (found) return found;
    }
    throw new Error("No actor");
  }

  context(): ExecutionContext {
    return {
      actorId: this.actor().id,
      spaceId: this.space().id,
      appId: this.app().id,
    };
  }

  resolvedSpec(): AppSpec {
    const app = this.app();
    const space = this.space();
    const spec = cloneSpec(app.spec);
    const localKeys = new Set(spec.types.map((type) => type.key));
    const exposed = space.spec.types.filter((type) => isExposed(type) && !localKeys.has(type.key));
    spec.types = [...exposed, ...spec.types];
    return effectiveSpec(spec);
  }

  snapshot(): HostSnapshot {
    const space = this.space();
    const app = this.app();
    return {
      backend: this.backend,
      engine: "sqlite",
      webmcp: typeof document !== "undefined" && Boolean(document.modelContext),
      space: cloneData(space),
      app: cloneData(app),
      spec: this.resolvedSpec(),
      sharedTypes: cloneData(space.spec.types.filter(isExposed)),
      actor: cloneData(this.actor()),
      spaces: this.platform.spaces
        .filter((item) => item.actors.length > 0)
        .map((item) => ({ id: item.id, name: item.name })),
      apps: this.apps().map((item) => ({ id: item.id, name: item.name })),
      stores: [
        ...(space.id === app.id
          ? []
          : [
              {
                key: "space",
                label: space.name,
                database: this.spaceFile(space.id),
                tables: this.storeTables.get(space.id) ?? [],
              },
            ]),
        {
          key: "app",
          label: app.name,
          database: this.spaceFile(app.id),
          tables: this.storeTables.get(app.id) ?? [],
        },
      ],
      catalog: {
        database: CATALOG_DATABASE,
        tables: this.catalogTables,
      },
    };
  }

  queryContext(): QueryContext {
    const spec = this.resolvedSpec();
    return {
      spec,
      sharedTypes: this.space().spec.types.filter(isExposed),
      engineFor: (type) => this.engineForType(type),
    };
  }

  async listRecords(typeKey: string): Promise<RecordValue[]> {
    const ctx = this.queryContext();
    const type = findType(ctx, typeKey);
    if (!type) return [];
    const rows = await ctx.engineFor(type).select(type.key, { orderBy: { updated_at: "desc" } });
    return rows.map((row) => decodeRecord(type, row));
  }

  async getRecord(typeKey: string, id: string): Promise<RecordValue | null> {
    const ctx = this.queryContext();
    const type = findType(ctx, typeKey);
    if (!type) return null;
    const row = await ctx.engineFor(type).get(type.key, id);
    return row ? decodeRecord(type, row) : null;
  }

  async create(typeKey: string, values: Record<string, unknown>): Promise<RecordValue> {
    const result = await createRecord(
      this.queryContext(),
      typeKey,
      cloneData(values),
      this.context(),
    );
    await this.afterChanges([result.change]);
    return result.record;
  }

  async update(typeKey: string, id: string, values: Record<string, unknown>): Promise<RecordValue> {
    const result = await updateRecord(
      this.queryContext(),
      typeKey,
      id,
      cloneData(values),
      this.context(),
    );
    await this.afterChanges([result.change]);
    return result.record;
  }

  async transition(typeKey: string, id: string, transitionKey: string): Promise<RecordValue> {
    const type = findType(this.queryContext(), typeKey);
    if (!type?.lifecycle) throw new Error(`${type?.label ?? typeKey} does not define a lifecycle`);
    const record = await this.getRecord(typeKey, id);
    if (!record) throw new Error(`${type.label} ${id} not found`);
    const current = scalarString(record[type.lifecycle.field]);
    const transition = type.lifecycle.transitions.find(
      (item) => item.key === transitionKey && item.from.includes(current),
    );
    if (!transition) {
      throw new Error(`Transition ${transitionKey} is not available from ${current}`);
    }
    return this.update(typeKey, id, { [type.lifecycle.field]: transition.to });
  }

  async remove(typeKey: string, id: string): Promise<void> {
    const result = await deleteRecord(this.queryContext(), typeKey, id);
    await this.afterChanges([result.change]);
  }

  async queryView(
    view: string | ViewDef,
    expose?: Record<string, unknown>,
    context?: ViewRunContext,
  ): Promise<Array<Record<string, unknown>>> {
    const resolved =
      typeof view === "string" ? this.resolvedSpec().views.find((item) => item.key === view) : view;
    if (!resolved) return [];
    return executeView(
      this.queryContext(),
      typeof view === "string" ? resolved : cloneData(resolved),
      expose ? cloneData(expose) : expose,
      context ? cloneData(context) : context,
    );
  }

  async invoke(flowKey: string, input: Record<string, unknown> = {}): Promise<WorkflowRun> {
    const spec = this.resolvedSpec();
    const workflow = spec.workflows.find((item) => item.key === flowKey);
    if (!workflow) throw new Error(`Unknown workflow ${flowKey}`);
    const ctx = this.queryContext();
    const run = await invokeWorkflow(ctx, workflow, cloneData(input), this.context(), {
      getWorkflow: (key) => spec.workflows.find((item) => item.key === key),
      guard: new Set(),
    });
    await this.afterChanges(run.changes);
    return run;
  }

  private async afterChanges(changes: ChangeEvent[]): Promise<void> {
    const spec = this.resolvedSpec();
    const ctx = this.queryContext();
    const guard = new Set<string>();
    const queue = [...changes];
    while (queue.length) {
      const change = queue.shift() as ChangeEvent;
      for (const workflow of matchingTriggers(spec.workflows, change)) {
        const token = `${workflow.key}:${change.id}`;
        if (guard.has(token)) continue;
        guard.add(token);
        const input: Record<string, unknown> = {
          [change.type]: change.after ?? change.before ?? change.id,
          id: change.id,
          ...(change.transition ? { transition: change.transition } : {}),
        };
        const run = await invokeWorkflow(ctx, workflow, input, this.context(), {
          getWorkflow: (key) => spec.workflows.find((item) => item.key === key),
          guard,
        });
        queue.push(...run.changes);
      }
    }
    await this.persistAndEmit();
  }

  async upsertType(draft: TypeDraft & { key: string }): Promise<TypeDef> {
    draft = cloneData(draft);
    const expose = Boolean(draft.expose);
    const target = expose ? this.space() : this.app();
    const spec = cloneSpec(target.spec);
    const next = normalizeSpec(
      {
        ...spec,
        types: {
          ...Object.fromEntries(spec.types.map((type) => [type.key, type])),
          [draft.key]: { ...draft, ...(expose ? { expose: true } : {}), store: "local" },
        },
      },
      spec,
    );
    await this.commitSpecs([{ id: target.id, spec: next }]);
    const committed = this.platform.spaces.find((item) => item.id === target.id);
    return committed?.spec.types.find((item) => item.key === draft.key) as TypeDef;
  }

  async renameType(from: string, to: string): Promise<TypeDef> {
    const { owner, spec, type } = this.writableTypeDraft(from);
    const key = slugify(to);
    if (!key) throw new Error("Type key required");
    if (key === from) return this.findWritableType(from);
    if (key === "_meta") throw new Error('Type key "_meta" is reserved by the runtime');
    this.assertTypeRenameAvailable(owner, type, from, key);

    type.key = key;
    const changes = this.rewriteTypeInConsumers(owner, spec, from, key);
    await this.commitSpecs(changes);
    return this.findWritableType(key);
  }

  async deleteType(key: string): Promise<void> {
    const app = this.app();
    const space = this.space();
    const references = this.typeReferences(key).filter(
      (reference) => !(reference.owner === "type" && reference.key === key),
    );
    if (references.length) throw referencedByError("type", key, references);
    const changes = new Map<string, AppSpec>();
    changes.set(app.id, {
      ...cloneSpec(app.spec),
      types: app.spec.types.filter((type) => type.key !== key),
    });
    changes.set(space.id, {
      ...cloneSpec(space.spec),
      types: space.spec.types.filter((type) => type.key !== key),
    });
    await this.commitSpecs([...changes].map(([id, spec]) => ({ id, spec })));
  }

  async renameField(typeKey: string, from: string, to: string): Promise<FieldDef> {
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    const field = type.fields.find((item) => item.key === from);
    if (!field) throw new Error(`Unknown field ${from}`);
    const key = normalizeFieldKey(to);
    if (type.fields.some((item) => item !== field && item.key === key)) {
      throw new Error(`Field key "${key}" already exists on ${typeKey}`);
    }
    const nextFields = type.fields.map((item) => {
      const renamed =
        item === field
          ? {
              ...item,
              key,
              label: item.label === labelFromKey(from) ? labelFromKey(key) : item.label,
            }
          : { ...item };
      for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
        if (renamed[property])
          renamed[property] = renameConditionField(renamed[property], from, key);
      }
      return renamed;
    });
    const lifecycle = type.lifecycle
      ? normalizeTypeLifecycle(
          { ...type, fields: nextFields },
          {
            ...type.lifecycle,
            field: type.lifecycle.field === from ? key : type.lifecycle.field,
          },
        )
      : undefined;
    type.fields = nextFields;
    if (lifecycle) type.lifecycle = lifecycle;
    const changes = this.rewriteFieldInConsumers(owner, spec, typeKey, from, key);
    await this.commitSpecs(changes);
    return this.findWritableType(typeKey).fields.find((item) => item.key === key) as FieldDef;
  }

  async deleteField(typeKey: string, key: string): Promise<void> {
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    if (type.lifecycle?.field === key) {
      throw new Error(`Cannot delete lifecycle field "${key}" while the lifecycle is configured`);
    }
    type.fields = type.fields
      .filter((item) => item.key !== key)
      .map((item) => {
        const next = { ...item };
        for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
          if (next[property] && conditionFieldKeys(next[property]).includes(key)) {
            delete next[property];
          }
        }
        if (!next.visible_when) delete next.hidden_value;
        return next;
      });
    const references = this.fieldReferences(typeKey, key, { owner, spec });
    if (references.length) throw referencedByError("field", `${typeKey}.${key}`, references);
    await this.commitSpecs([{ id: owner.id, spec }]);
  }

  async submitForm(
    formKey: string,
    values: Record<string, unknown>,
    recordId?: string,
  ): Promise<RecordValue | null> {
    const spec = this.resolvedSpec();
    const form = spec.forms.find((item) => item.key === formKey);
    if (!form) throw new Error(`Unknown form ${formKey}`);
    let record: RecordValue | null = null;
    let submitted = cloneData(values);
    if (form.mode === "standalone") {
      if (recordId) throw new Error(`${form.label} is not attached to a record`);
      submitted = prepareFieldValues(form.inputs ?? [], submitted);
      const errors = validateFields(form.inputs ?? [], submitted);
      if (errors.length) throw new Error(errors.join("; "));
    } else {
      if (!form.type) throw new Error(`${form.label} needs a record type`);
      if (recordId) record = await this.update(form.type, recordId, submitted);
      else record = await this.create(form.type, submitted);
      submitted = Object.fromEntries(
        (form.fields ?? [])
          .filter((field) => record && Object.hasOwn(record, field))
          .map((field) => [field, record?.[field]]),
      );
    }
    await this.afterEvent("form.submitted", {
      form: form.key,
      values: submitted,
      ...(record ? { record } : {}),
    });
    return record;
  }

  private async afterEvent(key: string, payload: Record<string, unknown>): Promise<void> {
    const spec = this.resolvedSpec();
    for (const workflow of matchingEventTriggers(spec.workflows, key, payload)) {
      const run = await invokeWorkflow(
        this.queryContext(),
        workflow,
        cloneData(payload),
        this.context(),
        { getWorkflow: (workflowKey) => spec.workflows.find((item) => item.key === workflowKey) },
      );
      await this.afterChanges(run.changes);
    }
  }

  async upsertField(
    typeKey: string,
    field: Partial<FieldDef> & { key: string },
  ): Promise<FieldDef> {
    field = cloneData(field);
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    const key = normalizeFieldKey(field.key);
    const existing = type.fields.find((item) => item.key === key);
    const label =
      String(field.label ?? "").trim() || String(existing?.label ?? "").trim() || labelFromKey(key);
    const updated = normalizeField(
      key,
      {
        id: existing?.id ?? createSpecId(),
        type: "text",
        ...existing,
        ...field,
        key,
        label,
      } as FieldDef,
      existing,
    );
    const next = existing
      ? type.fields.map((item) => (item.key === key ? updated : item))
      : [...type.fields, updated];
    validateFieldCapabilities(type.key, next);
    if (type.lifecycle) normalizeTypeLifecycle({ ...type, fields: next }, type.lifecycle);
    type.fields = next;
    await this.commitSpecs([{ id: owner.id, spec }]);
    return this.findWritableType(typeKey).fields.find((item) => item.key === key) as FieldDef;
  }

  async reorderFields(typeKey: string, keys: string[]): Promise<TypeDef> {
    keys = cloneData(keys);
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    const map = new Map(type.fields.map((field) => [field.key, field]));
    const next = keys
      .map((key) => map.get(key))
      .filter((field): field is FieldDef => Boolean(field));
    for (const field of type.fields) {
      if (!keys.includes(field.key)) next.push(field);
    }
    type.fields = next;
    await this.commitSpecs([{ id: owner.id, spec }]);
    return this.findWritableType(typeKey);
  }

  async upsertView(draft: Partial<ViewDef> & { key: string }): Promise<ViewDef> {
    draft = cloneData(draft);
    const appId = this.app().id;
    const spec = cloneSpec(this.app().spec);
    const existing = spec.views.find((view) => view.key === draft.key);
    const groupBy = draft.group_by ?? existing?.group_by;
    const suppliedFields = Object.hasOwn(draft, "fields");
    if (!groupBy && suppliedFields && draft.fields?.length === 0) {
      throw new Error(
        `View "${draft.key}" needs at least one field. Omit fields to choose useful defaults automatically.`,
      );
    }
    if (!existing && !groupBy && !suppliedFields) {
      const source = this.resolvedSpec().types.find((type) => type.key === draft.source);
      if (!source) throw new Error(`Unknown source type "${draft.source ?? ""}"`);
      draft.fields = defaultViewFields(source);
    }
    const views = upsertNamed(
      spec.views,
      normalizeView({
        id: existing?.id || createSpecId(),
        label: labelFromKey(draft.key),
        source: "",
        fields: [],
        ...existing,
        ...draft,
        key: draft.key,
        implicit: false,
      }),
    );
    await this.commitSpecs([{ id: appId, spec: { ...spec, views } }]);
    return this.app().spec.views.find((item) => item.key === draft.key) as ViewDef;
  }

  async upsertForm(draft: FormDraft & { key: string }): Promise<FormDef> {
    draft = cloneData(draft);
    const appId = this.app().id;
    const spec = cloneSpec(this.app().spec);
    const existing = spec.forms.find((form) => form.key === draft.key);
    const candidate = {
      id: existing?.id || createSpecId(),
      label: labelFromKey(draft.key),
      mode: draft.type ? "create" : "standalone",
      ...existing,
      ...draft,
      key: draft.key,
      implicit: false,
    } as FormDraft & { id: string; key: string; label: string; mode: FormDef["mode"] };
    if (existing?.inputs && Array.isArray(candidate.inputs)) {
      const existingById = new Map(existing.inputs.map((input) => [input.id, input]));
      for (const input of candidate.inputs) {
        if (typeof input === "string" || !input.id || !input.key) continue;
        const previous = existingById.get(input.id);
        if (!previous || previous.key === input.key) continue;
        const nextKey = input.key;
        for (const sibling of candidate.inputs) {
          if (typeof sibling === "string") continue;
          for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
            if (sibling[property]) {
              sibling[property] = renameConditionField(sibling[property], previous.key, nextKey);
            }
          }
        }
      }
    }
    const next = normalizeSpec({ ...spec, forms: upsertNamed(spec.forms, candidate) }, spec);
    await this.commitSpecs([{ id: appId, spec: next }]);
    return this.app().spec.forms.find((item) => item.key === draft.key) as FormDef;
  }

  async upsertWorkflow(draft: Partial<WorkflowDef> & { key: string }): Promise<WorkflowDef> {
    draft = cloneData(draft);
    const appId = this.app().id;
    const spec = cloneSpec(this.app().spec);
    const existing = spec.workflows.find((workflow) => workflow.key === draft.key);
    const workflows = upsertNamed(spec.workflows, {
      label: labelFromKey(draft.key),
      steps: [],
      ...existing,
      ...draft,
      id: existing?.id || draft.id || createSpecId(),
    });
    assertValidAutomation(workflows.find((item) => item.key === draft.key));
    await this.commitSpecs([{ id: appId, spec: { ...spec, workflows } }]);
    return this.app().spec.workflows.find((item) => item.key === draft.key) as WorkflowDef;
  }

  async upsertPage(draft: Partial<PageDef> & { key: string }): Promise<PageDef> {
    draft = cloneData(draft);
    const appId = this.app().id;
    const spec = cloneSpec(this.app().spec);
    const existing = spec.pages.find((page) => page.key === draft.key);
    const folder = draft.folder !== undefined ? folderName(draft.folder) : existing?.folder;
    const blocks =
      draft.blocks !== undefined
        ? configurePageRows(this.resolvedSpec(), draft.blocks)
        : normalizePageRows(existing?.blocks ?? []);
    let icon = existing?.icon;
    if (draft.icon !== undefined) {
      icon = normalizePageIcon(draft.icon);
      if (!icon) throw new Error(`Invalid page icon "${scalarString(draft.icon)}"`);
    } else if (!existing) {
      icon = guessPageIcon(blocks);
    }
    const pages = upsertNamed(spec.pages, {
      id: existing?.id || createSpecId(),
      label: labelFromKey(draft.key),
      ...existing,
      ...draft,
      folder,
      icon,
      implicit: false,
      blocks,
    });
    await this.commitSpecs([{ id: appId, spec: { ...spec, pages } }]);
    return this.app().spec.pages.find((item) => item.key === draft.key) as PageDef;
  }

  async deleteView(key: string): Promise<void> {
    const app = this.app();
    const spec = cloneSpec(app.spec);
    await this.commitSpecs([
      { id: app.id, spec: { ...spec, views: spec.views.filter((view) => view.key !== key) } },
    ]);
  }

  async deleteForm(key: string): Promise<void> {
    const app = this.app();
    const spec = cloneSpec(app.spec);
    await this.commitSpecs([
      { id: app.id, spec: { ...spec, forms: spec.forms.filter((form) => form.key !== key) } },
    ]);
  }

  async deleteWorkflow(key: string): Promise<void> {
    const app = this.app();
    const spec = cloneSpec(app.spec);
    await this.commitSpecs([
      {
        id: app.id,
        spec: { ...spec, workflows: spec.workflows.filter((workflow) => workflow.key !== key) },
      },
    ]);
  }

  async replaceAuthoredPages(pages: PageDef[]): Promise<void> {
    pages = cloneData(pages);
    const appId = this.app().id;
    const spec = cloneSpec(this.app().spec);
    const keep = spec.pages.filter((page) => page.key === "home" || page.path === "/");
    const authored = pages
      .filter((page) => !page.implicit && page.key !== "home" && page.path !== "/")
      .map((page) => ({
        ...page,
        folder: page.folder?.trim() || undefined,
        blocks: cloneData(page.blocks ?? []),
      }));
    await this.commitSpecs([{ id: appId, spec: { ...spec, pages: [...keep, ...authored] } }]);
  }

  async deletePage(key: string): Promise<void> {
    const app = this.app();
    const spec = cloneSpec(app.spec);
    await this.commitSpecs([
      { id: app.id, spec: { ...spec, pages: spec.pages.filter((page) => page.key !== key) } },
    ]);
  }

  async applySpec(input: unknown): Promise<AppSpec> {
    const workspace = this.app();
    const next = normalizeSpec(cloneData(input) as never, workspace.spec);
    const localKeys = new Set(next.types.map((type) => type.key));
    const exposed = this.space().spec.types.filter(
      (type) => isExposed(type) && !localKeys.has(type.key),
    );
    const validationSpec = effectiveSpec({
      ...cloneSpec(next),
      types: [...cloneData(exposed), ...next.types],
    });
    for (const page of next.pages) {
      page.blocks = configurePageRows(validationSpec, page.blocks);
    }
    await this.commitSpecs([{ id: workspace.id, spec: next }]);
    return this.resolvedSpec();
  }

  async replaceSpecText(text: string): Promise<AppSpec> {
    return this.applySpec(specFromText(text));
  }

  exportJson(): string {
    return specToJson(effectiveSpec(this.app().spec));
  }

  exportYaml(): string {
    return specToYaml(effectiveSpec(this.app().spec));
  }

  private async insertApp(
    name: string,
    spec?: AppSpec,
    options: { silent?: boolean } = {},
  ): Promise<SpaceState> {
    const app: SpaceState = {
      id: createId("spc"),
      name,
      createdBy: this.actor().id,
      actors: [],
      spec: spec ? normalizeSpec(spec) : newAppSpec(slugify(name), name),
    };
    this.platform.spaces.push(app);
    this.platform.activeSpaceId = app.id;
    await this.bootEngines();
    await this.reconcileAll();
    if (!options.silent) await this.persistAndEmit();
    return app;
  }

  async switchApp(id: string): Promise<void> {
    const app = this.apps().find((item) => item.id === id);
    if (!app) throw new Error("Unknown app");
    this.platform.activeSpaceId = id;
    await this.bootEngines();
    await this.reconcileAll();
    await this.persistAndEmit();
  }

  async createSpace(name: string): Promise<SpaceState> {
    const seeded = seedSpace(name);
    this.platform.spaces.push(...seeded.spaces);
    this.platform.activeSpaceId = seeded.activeId;
    await this.bootEngines();
    await this.reconcileAll();
    await this.persistAndEmit();
    return this.space();
  }

  async switchSpace(id: string): Promise<void> {
    const account = this.platform.spaces.find((item) => item.id === id && item.actors.length > 0);
    if (!account) throw new Error("Unknown space");
    const human = account.actors.find((item) => item.kind === "human") ?? account.actors[0];
    const firstApp = this.platform.spaces.find((item) => item.createdBy === human?.id);
    if (firstApp) {
      this.platform.activeSpaceId = firstApp.id;
      await this.bootEngines();
      await this.reconcileAll();
      await this.persistAndEmit();
      return;
    }
    this.platform.activeSpaceId = account.id;
    await this.insertApp("Home");
  }

  async renameSpace(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name required");
    this.space().name = trimmed;
    await this.persistAndEmit();
  }

  async renameApp(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name required");
    const app = this.app();
    app.name = trimmed;
    app.spec = { ...app.spec, label: trimmed };
    await this.persistAndEmit();
  }

  async updateSpaceAppearance(accent: SpaceAccent): Promise<void> {
    if (!SPACE_ACCENT_KEYS.includes(accent)) throw new Error("Unknown accent colour");
    this.space().appearance = { accent };
    await this.persistAndEmit();
  }

  async updateActor(patch: { name?: string; email?: string }): Promise<Actor> {
    patch = cloneData(patch);
    const actor = this.actor();
    if (patch.name != null) {
      const name = patch.name.trim();
      if (!name) throw new Error("Name required");
      actor.name = name;
    }
    if (patch.email != null) actor.email = patch.email.trim() || undefined;
    await this.persistAndEmit();
    return actor;
  }

  async deleteApp(id: string): Promise<SpaceState> {
    const target = this.platform.spaces.find((item) => item.id === id);
    if (!target?.createdBy) throw new Error("Unknown app");
    const createdBy = target.createdBy;
    const others = this.platform.spaces.filter(
      (item) => item.createdBy === createdBy && item.id !== id,
    );
    const deletingActive = this.platform.activeSpaceId === id;
    if (deletingActive) await this.closeLocalEngine();
    this.platform.spaces = this.platform.spaces.filter((item) => item.id !== id);
    if (deletingActive) {
      if (others.length) this.platform.activeSpaceId = others[0]!.id;
      else {
        const blank: SpaceState = {
          id: createId("spc"),
          name: "Home",
          createdBy,
          actors: [],
          spec: newAppSpec("home", "Home"),
        };
        this.platform.spaces.push(blank);
        this.platform.activeSpaceId = blank.id;
      }
      await this.bootEngines();
      await this.reconcileAll();
    }
    await this.persistAndEmit();
    return this.app();
  }

  private async closeLocalEngine(): Promise<void> {
    const appId = this.app().id;
    if (appId === this.space().id) return;
    const engine = this.engines.get(appId);
    if (engine && "close" in engine && typeof engine.close === "function") {
      await engine.close();
    }
    this.engines.delete(appId);
  }

  async createApp(name: string, template?: string | null): Promise<SpaceState> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name required");
    if (template) return this.loadSample(template, trimmed);
    return this.insertApp(trimmed);
  }

  async loadSample(key: string, name?: string): Promise<SpaceState> {
    const sample = sampleApps.find((item) => item.key === key);
    if (!sample) throw new Error(`Unknown sample ${key}`);
    this.installExposedTypes(sample.exposedTypes ?? []);
    const workspace = await this.insertApp(name?.trim() || sample.label, sample.spec, {
      silent: true,
    });
    this.silent = true;
    try {
      await this.seedRecords(sample.records ?? []);
    } catch (error) {
      console.error("builder.run failed to seed template records", error);
    } finally {
      this.silent = false;
    }
    await this.persistAndEmit();
    return workspace;
  }

  private installExposedTypes(types: TypeDef[]): void {
    if (!types.length) return;
    const space = this.space();
    const have = new Set(space.spec.types.map((type) => type.key));
    const incoming = types
      .filter((type) => !have.has(type.key))
      .map((type) => ({ ...type, store: "local" as const, expose: true as const }));
    if (!incoming.length) return;
    space.spec = normalizeSpec(
      { ...space.spec, types: [...space.spec.types, ...incoming] },
      space.spec,
    );
  }

  private async seedRecords(
    rows: Array<{ type: string; as?: string; values: Record<string, unknown> }>,
  ): Promise<void> {
    const aliases: Record<string, string> = {};
    for (const row of rows) {
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row.values)) {
        values[key] =
          typeof value === "string" && value.startsWith("$")
            ? (aliases[value.slice(1)] ?? value)
            : value;
      }
      const ctx = this.queryContext();
      const type = findType(ctx, row.type);
      if (type && isExposed(type) && typeof values.name === "string") {
        const existing = (await this.listRecords(row.type)).find(
          (record) => record.name === values.name,
        );
        if (existing) {
          if (row.as) aliases[row.as] = existing.id;
          continue;
        }
      }
      const record = await this.create(row.type, values);
      if (row.as) aliases[row.as] = record.id;
    }
  }

  async inspectStore(
    which: string,
  ): Promise<{ database: string; tables: Array<{ name: string; columns: string[] }> }> {
    if (which !== "local" && which !== "space") throw new Error(`Unknown store ${which}`);
    const id = which === "space" ? this.space().id : this.app().id;
    const engine = this.engines.get(id);
    if (!engine) throw new Error(`Store ${which} is not open`);
    const names = await engine.listTables();
    const tables = [];
    for (const name of names) {
      const columns = await engine.tableInfo(name);
      tables.push({ name, columns: columns.map((column) => `${column.name} ${column.sqlType}`) });
    }
    return { database: this.spaceFile(id), tables };
  }

  /** Close stores and delete catalog, space files, and leftover IndexedDB on this device. */
  async resetLocalData(): Promise<void> {
    for (const engine of this.engines.values()) {
      try {
        if ("close" in engine && typeof engine.close === "function") {
          await engine.close();
        }
      } catch (error) {
        console.warn("builder.run close store failed", error);
      }
    }
    this.engines.clear();
    try {
      await this.catalog.close();
    } catch (error) {
      console.warn("builder.run close catalog failed", error);
    }
    await this.gateway.wipe();
  }

  private findWritableType(typeKey: string): TypeDef {
    const local = this.app().spec.types.find((type) => type.key === typeKey);
    if (local) return local;
    const shared = this.space().spec.types.find((type) => type.key === typeKey);
    if (shared) return shared;
    throw new Error(`Unknown type ${typeKey}`);
  }

  fieldReferences(
    typeKey: string,
    fieldKey: string,
    candidate?: { owner: SpaceState; spec: AppSpec },
  ): SpecReference[] {
    const owner = candidate?.owner ?? this.writableTypeDraft(typeKey).owner;
    const ownerSpec = candidate?.spec ?? owner.spec;
    const references = findFieldReferences(ownerSpec, typeKey, fieldKey);
    if (owner.id !== this.space().id) return references;

    for (const app of this.apps()) {
      if (app.spec.types.some((type) => type.key === typeKey)) continue;
      const composite = specWithSharedTypes(app.spec, ownerSpec);
      references.push(
        ...findFieldReferences(composite, typeKey, fieldKey)
          .filter((reference) => reference.owner !== "type")
          .map((reference) => scopedReference(app, reference)),
      );
    }
    return uniqueReferences(references);
  }

  typeReferences(typeKey: string): SpecReference[] {
    const local = this.app().spec.types.some((type) => type.key === typeKey);
    const owner = local ? this.app() : this.space();
    const references = findTypeReferences(owner.spec, typeKey);
    if (local) return references;

    for (const app of this.apps()) {
      if (app.spec.types.some((type) => type.key === typeKey)) continue;
      const composite = specWithSharedTypes(app.spec, owner.spec);
      references.push(
        ...findTypeReferences(composite, typeKey)
          .filter((reference) => reference.owner !== "type")
          .map((reference) => scopedReference(app, reference)),
      );
    }
    return uniqueReferences(references);
  }

  private rewriteFieldInConsumers(
    owner: SpaceState,
    ownerSpec: AppSpec,
    typeKey: string,
    from: string,
    to: string,
  ): Array<{ id: string; spec: AppSpec }> {
    const changes = new Map<string, AppSpec>();
    const rewrittenOwner = rewriteFieldReferences(ownerSpec, typeKey, from, to);
    changes.set(owner.id, rewrittenOwner);
    if (owner.id !== this.space().id) return [...changes].map(([id, spec]) => ({ id, spec }));

    for (const app of this.apps()) {
      if (app.spec.types.some((type) => type.key === typeKey)) continue;
      const composite = rewriteFieldReferences(
        specWithSharedTypes(app.spec, rewrittenOwner),
        typeKey,
        from,
        to,
      );
      changes.set(app.id, {
        ...cloneSpec(app.spec),
        views: composite.views,
        forms: composite.forms,
        workflows: composite.workflows,
        pages: composite.pages,
      });
    }
    return [...changes].map(([id, spec]) => ({ id, spec }));
  }

  private rewriteTypeInConsumers(
    owner: SpaceState,
    ownerSpec: AppSpec,
    from: string,
    to: string,
  ): Array<{ id: string; spec: AppSpec }> {
    const changes = new Map<string, AppSpec>();
    changes.set(owner.id, rewriteTypeReferences(ownerSpec, from, to));
    if (owner.id !== this.space().id) return [...changes].map(([id, spec]) => ({ id, spec }));

    for (const app of this.apps()) {
      if (app.spec.types.some((type) => type.key === from)) continue;
      changes.set(app.id, rewriteTypeReferences(app.spec, from, to));
    }
    return [...changes].map(([id, spec]) => ({ id, spec }));
  }

  private assertTypeRenameAvailable(
    owner: SpaceState,
    type: TypeDef,
    from: string,
    to: string,
  ): void {
    const consumers =
      owner.id === this.space().id ? [owner, ...this.apps()] : [owner, this.space()];
    for (const consumer of consumers) {
      const conflict = consumer.spec.types.find(
        (candidate) => candidate.key === to && candidate.id !== type.id,
      );
      if (conflict) {
        throw new Error(`Type key "${to}" is already used by ${conflict.label}`);
      }
    }

    for (const app of owner.id === this.space().id ? this.apps() : [owner]) {
      const view = app.spec.views.find(
        (candidate) => candidate.key === `${to}_list` && candidate.source !== from,
      );
      if (view) throw new Error(`Type key "${to}" conflicts with view "${view.key}"`);
      const form = app.spec.forms.find(
        (candidate) =>
          (candidate.key === `${to}_create` || candidate.key === `${to}_edit`) &&
          candidate.type !== from,
      );
      if (form) throw new Error(`Type key "${to}" conflicts with form "${form.key}"`);
      const page = app.spec.pages.find((candidate) => candidate.key === `${to}_page`);
      if (page) throw new Error(`Type key "${to}" conflicts with page "${page.key}"`);
    }
  }

  private writableTypeDraft(typeKey: string): {
    owner: SpaceState;
    spec: AppSpec;
    type: TypeDef;
  } {
    const owner = this.app().spec.types.some((type) => type.key === typeKey)
      ? this.app()
      : this.space().spec.types.some((type) => type.key === typeKey)
        ? this.space()
        : undefined;
    if (!owner) throw new Error(`Unknown type ${typeKey}`);
    const spec = cloneSpec(owner.spec);
    const type = spec.types.find((item) => item.key === typeKey);
    if (!type) throw new Error(`Unknown type ${typeKey}`);
    return { owner, spec, type };
  }
}

function specWithSharedTypes(app: AppSpec, space: AppSpec): AppSpec {
  const local = cloneSpec(app);
  const localKeys = new Set(local.types.map((type) => type.key));
  return {
    ...local,
    types: [
      ...local.types,
      ...cloneData(space.types.filter((type) => isExposed(type) && !localKeys.has(type.key))),
    ],
  };
}

function scopedReference(scope: SpaceState, reference: SpecReference): SpecReference {
  return {
    ...reference,
    path: `spaces.${scope.id}.${reference.path}`,
    description: `${scope.name}: ${reference.description}`,
  };
}

function uniqueReferences(references: SpecReference[]): SpecReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (seen.has(reference.path)) return false;
    seen.add(reference.path);
    return true;
  });
}

function referencedByError(
  kind: "type" | "field",
  key: string,
  references: SpecReference[],
): Error {
  const preview = references
    .slice(0, 3)
    .map((reference) => reference.description)
    .join(", ");
  const remaining = references.length > 3 ? ` and ${references.length - 3} more` : "";
  return new Error(`Cannot delete ${kind} "${key}" because it is used by ${preview}${remaining}`);
}

function folderName(value: unknown): string | undefined {
  if (value == null || value === false) return undefined;
  const text = scalarString(value).trim();
  return text || undefined;
}

function upsertNamed<T extends { key: string }>(list: T[], item: T): T[] {
  if (list.some((existing) => existing.key === item.key)) {
    return list.map((existing) =>
      existing.key === item.key ? { ...existing, ...item } : existing,
    );
  }
  return [...list, item];
}

function seedPlatform(): PlatformState {
  const seeded = seedSpace("Personal Space");
  return {
    version: 1,
    activeSpaceId: seeded.activeId,
    spaces: seeded.spaces,
  };
}

function seedSpace(name: string): { spaces: SpaceState[]; activeId: string } {
  const human: Actor = { id: createId("act"), name: "You", kind: "human", roles: ["admin"] };
  const system: Actor = { id: createId("act"), name: "System", kind: "system", roles: ["admin"] };
  const rootId = createId("spc");
  const appId = createId("spc");
  const root: SpaceState = {
    id: rootId,
    name,
    actors: [human, system],
    appearance: { accent: "blue" },
    spec: rootSpaceSpec(name),
  };
  const home: SpaceState = {
    id: appId,
    name: "Home",
    createdBy: human.id,
    actors: [],
    spec: newAppSpec("home", "Home"),
  };
  return { spaces: [root, home], activeId: appId };
}

async function migrateLegacyJson(): Promise<PlatformState | null> {
  try {
    const raw = await readPlatformJson(typeof indexedDB === "undefined" ? "memory" : "indexeddb");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      activeSpaceId?: string;
      spaces?: SpaceState[];
    };
    if (!parsed.spaces?.length) return null;
    if (parsed.spaces.some((item) => "parentId" in item && !("createdBy" in item))) return null;
    return {
      version: 1,
      activeSpaceId: parsed.activeSpaceId ?? parsed.spaces[0].id,
      spaces: parsed.spaces,
    };
  } catch {
    return null;
  }
}
