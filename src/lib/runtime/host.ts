import {
  CATALOG_DATABASE,
  ensureCatalog,
  listCatalogTables,
  loadPlatform,
  savePlatform,
} from "./catalog.ts";
import { applyDefaults, effectiveSpec } from "./defaults.ts";
import type { TableEngine } from "./engine.ts";
import { invokeFlow, matchingTriggers, type FlowRun } from "./flows.ts";
import { createId, labelFromKey, slugify } from "./ids.ts";
import {
  cloneData,
  cloneSpec,
  normalizeField,
  normalizeFieldKey,
  normalizeSpec,
  normalizeView,
  type Actor,
  type AppSpec,
  type ExecutionContext,
  type FieldDef,
  type FlowDef,
  type FormDef,
  type PageDef,
  type RecordValue,
  type TypeDef,
  type TypeDraft,
  type ViewDef,
  isExposed,
} from "./model.ts";
import { readPlatformJson, type PersistenceBackend } from "./persist.ts";
import type { PlatformState, SpaceState } from "./platform.ts";
import { executeView, findType, type QueryContext, type ViewRunContext } from "./query.ts";
import {
  createRecord,
  decodeRecord,
  deleteRecord,
  updateRecord,
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
    try {
      await this.saveCatalog();
    } catch (error) {
      console.warn("builder.run persist failed", error);
    }
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
    const space = this.space();
    const app = this.app();
    const spaceEngine = this.engines.get(space.id);
    if (spaceEngine) {
      await reconcileStore(spaceEngine, space.spec.types);
      this.storeTables.set(space.id, await spaceEngine.listTables());
    }
    if (app.id !== space.id) {
      const appEngine = this.engines.get(app.id);
      if (appEngine) {
        await reconcileStore(appEngine, app.spec.types);
        this.storeTables.set(app.id, await appEngine.listTables());
      }
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
    return applyDefaults(spec);
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

  async invoke(flowKey: string, input: Record<string, unknown> = {}): Promise<FlowRun> {
    const spec = this.resolvedSpec();
    const flow = spec.flows.find((item) => item.key === flowKey);
    if (!flow) throw new Error(`Unknown flow ${flowKey}`);
    const ctx = this.queryContext();
    const run = await invokeFlow(ctx, flow, cloneData(input), this.context(), {
      getFlow: (key) => spec.flows.find((item) => item.key === key),
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
      for (const flow of matchingTriggers(spec.flows, change)) {
        const token = `${flow.key}:${change.id}`;
        if (guard.has(token)) continue;
        guard.add(token);
        const input: Record<string, unknown> = {
          [change.type]: change.after ?? change.before ?? change.id,
          id: change.id,
        };
        const run = await invokeFlow(ctx, flow, input, this.context(), {
          getFlow: (key) => spec.flows.find((item) => item.key === key),
          guard,
        });
        queue.push(...run.changes);
      }
    }
    await this.persistAndEmit();
  }

  async upsertType(draft: TypeDraft & { key: string }): Promise<TypeDef> {
    draft = cloneData(draft);
    const expose = Boolean(draft.expose) || draft.store === "shared";
    const target = expose ? this.space() : this.app();
    const spec = target.spec;
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
    const type = next.types.find((item) => item.key === draft.key) as TypeDef;
    target.spec = applyDefaults(next);
    await this.reconcileAll();
    await this.persistAndEmit();
    return type;
  }

  async deleteType(key: string): Promise<void> {
    const app = this.app();
    app.spec.types = app.spec.types.filter((type) => type.key !== key);
    app.spec = applyDefaults(app.spec);
    const space = this.space();
    space.spec.types = space.spec.types.filter((type) => type.key !== key);
    space.spec = applyDefaults(space.spec);
    await this.reconcileAll();
    await this.persistAndEmit();
  }

  async renameField(typeKey: string, from: string, to: string): Promise<FieldDef> {
    const type = this.findWritableType(typeKey);
    const field = type.fields.find((item) => item.key === from);
    if (!field) throw new Error(`Unknown field ${from}`);
    const key = normalizeFieldKey(to);
    if (type.fields.some((item) => item !== field && item.key === key)) {
      throw new Error(`Field key "${key}" already exists on ${typeKey}`);
    }
    if (field.label === labelFromKey(from)) field.label = labelFromKey(key);
    field.key = key;
    await this.reconcileAll();
    await this.persistAndEmit();
    return field;
  }

  async deleteField(typeKey: string, key: string): Promise<void> {
    const type = this.findWritableType(typeKey);
    type.fields = type.fields.filter((item) => item.key !== key);
    await this.reconcileAll();
    await this.persistAndEmit();
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
    if (recordId) {
      record = await this.update(form.type, recordId, values);
    } else if (form.mode !== "custom" || !form.submit?.flow) {
      record = await this.create(form.type, values);
    }
    if (form.submit?.flow) {
      await this.invoke(form.submit.flow, {
        ...(record ? { [form.type]: record.id } : {}),
        ...values,
      });
      if (record) record = await this.getRecord(form.type, record.id);
    }
    return record;
  }

  async upsertField(
    typeKey: string,
    field: Partial<FieldDef> & { key: string },
  ): Promise<FieldDef> {
    field = cloneData(field);
    const type = this.findWritableType(typeKey);
    const key = normalizeFieldKey(field.key);
    const existing = type.fields.find((item) => item.key === key);
    const label =
      String(field.label ?? "").trim() || String(existing?.label ?? "").trim() || labelFromKey(key);
    const updated = normalizeField(
      key,
      {
        id: existing?.id ?? createId("fld"),
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
    type.fields = next;
    await this.reconcileAll();
    await this.persistAndEmit();
    return next.find((item) => item.key === key) as FieldDef;
  }

  async reorderFields(typeKey: string, keys: string[]): Promise<TypeDef> {
    keys = cloneData(keys);
    const type = this.findWritableType(typeKey);
    const map = new Map(type.fields.map((field) => [field.key, field]));
    const next = keys
      .map((key) => map.get(key))
      .filter((field): field is FieldDef => Boolean(field));
    for (const field of type.fields) {
      if (!keys.includes(field.key)) next.push(field);
    }
    type.fields = next;
    await this.persistAndEmit();
    return type;
  }

  async upsertView(draft: Partial<ViewDef> & { key: string }): Promise<ViewDef> {
    draft = cloneData(draft);
    const spec = this.app().spec;
    const existing = spec.views.find((view) => view.key === draft.key);
    const views = upsertNamed(
      spec.views,
      normalizeView({
        id: existing?.id || createId("vw"),
        label: labelFromKey(draft.key),
        source: "",
        fields: [],
        ...existing,
        ...draft,
        key: draft.key,
        implicit: false,
      }),
    );
    this.app().spec = applyDefaults({ ...spec, views });
    await this.persistAndEmit();
    return views.find((item) => item.key === draft.key) as ViewDef;
  }

  async upsertForm(draft: Partial<FormDef> & { key: string }): Promise<FormDef> {
    draft = cloneData(draft);
    const spec = this.app().spec;
    const existing = spec.forms.find((form) => form.key === draft.key);
    const forms = upsertNamed(spec.forms, {
      id: existing?.id || createId("frm"),
      label: labelFromKey(draft.key),
      type: "",
      fields: [],
      mode: "custom",
      ...existing,
      ...draft,
      implicit: false,
    } as FormDef);
    this.app().spec = applyDefaults({ ...spec, forms });
    await this.persistAndEmit();
    return forms.find((item) => item.key === draft.key) as FormDef;
  }

  async upsertFlow(draft: Partial<FlowDef> & { key: string }): Promise<FlowDef> {
    draft = cloneData(draft);
    const spec = this.app().spec;
    const flows = upsertNamed(spec.flows, {
      id: createId("flw"),
      label: labelFromKey(draft.key),
      steps: [],
      ...draft,
    });
    this.app().spec = { ...spec, flows };
    await this.persistAndEmit();
    return flows.find((item) => item.key === draft.key) as FlowDef;
  }

  async upsertPage(draft: Partial<PageDef> & { key: string }): Promise<PageDef> {
    draft = cloneData(draft);
    const spec = this.app().spec;
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
      id: existing?.id || createId("pg"),
      label: labelFromKey(draft.key),
      ...existing,
      ...draft,
      folder,
      icon,
      implicit: false,
      blocks,
    });
    this.app().spec = applyDefaults({ ...spec, pages });
    await this.persistAndEmit();
    return pages.find((item) => item.key === draft.key) as PageDef;
  }

  async deleteView(key: string): Promise<void> {
    const spec = this.app().spec;
    this.app().spec = applyDefaults({
      ...spec,
      views: spec.views.filter((view) => view.key !== key),
    });
    await this.persistAndEmit();
  }

  async deleteForm(key: string): Promise<void> {
    const spec = this.app().spec;
    this.app().spec = applyDefaults({
      ...spec,
      forms: spec.forms.filter((form) => form.key !== key),
    });
    await this.persistAndEmit();
  }

  async deleteFlow(key: string): Promise<void> {
    const spec = this.app().spec;
    this.app().spec = { ...spec, flows: spec.flows.filter((flow) => flow.key !== key) };
    await this.persistAndEmit();
  }

  async replaceAuthoredPages(pages: PageDef[]): Promise<void> {
    pages = cloneData(pages);
    const spec = this.app().spec;
    const keep = spec.pages.filter(
      (page) => page.implicit || page.key === "home" || page.path === "/",
    );
    const authored = pages
      .filter((page) => !page.implicit && page.key !== "home" && page.path !== "/")
      .map((page) => ({
        ...page,
        folder: page.folder?.trim() || undefined,
        blocks: cloneData(page.blocks ?? []),
      }));
    this.app().spec = applyDefaults({ ...spec, pages: [...keep, ...authored] });
    await this.persistAndEmit();
  }

  async deletePage(key: string): Promise<void> {
    const spec = this.app().spec;
    this.app().spec = applyDefaults({
      ...spec,
      pages: spec.pages.filter((page) => page.key !== key),
    });
    await this.persistAndEmit();
  }

  async applySpec(input: unknown): Promise<AppSpec> {
    const workspace = this.app();
    const next = applyDefaults(normalizeSpec(cloneData(input) as never, workspace.spec));
    const localKeys = new Set(next.types.map((type) => type.key));
    const exposed = this.space().spec.types.filter(
      (type) => isExposed(type) && !localKeys.has(type.key),
    );
    const validationSpec = applyDefaults({
      ...cloneSpec(next),
      types: [...cloneData(exposed), ...next.types],
    });
    for (const page of next.pages) {
      page.blocks = configurePageRows(validationSpec, page.blocks);
    }
    workspace.spec = next;
    await this.reconcileAll();
    await this.persistAndEmit();
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
      spec: spec ? applyDefaults(normalizeSpec(spec)) : newAppSpec(slugify(name), name),
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
    space.spec = applyDefaults({
      ...space.spec,
      types: [...space.spec.types, ...incoming],
    });
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
    const id = which === "shared" || which === "space" ? this.space().id : this.app().id;
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
