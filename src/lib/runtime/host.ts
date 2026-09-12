import {
  CATALOG_DATABASE,
  ensureCatalog,
  listCatalogTables,
  loadPlatform,
  savePlatform,
} from "./catalog.ts";
import { authoredSpec, effectiveSpec } from "./defaults.ts";
import type { TableEngine } from "./engine.ts";
import { createId, slugify } from "./ids.ts";
import {
  cloneData,
  cloneSpec,
  normalizeSpec,
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
import type { PersistenceBackend } from "./persist.ts";
import {
  SPACE_ACCENT_KEYS,
  type PlatformState,
  type SpaceAccent,
  type SpaceState,
} from "./platform.ts";
import { findType, type QueryContext, type ViewRunContext } from "./query.ts";
import { RecordService, type WorkflowRun } from "./record-service.ts";
import { newAppSpec, rootSpaceSpec, sampleApps } from "./samples.ts";
import { reconcileStore } from "./schema.ts";
import { SpecService, type SpecChange } from "./spec-service.ts";
import { SqliteEngine } from "./sql-engine.ts";
import { openSqlGateway, type SqlConnection, type SqlGateway } from "./sql-gateway.ts";
import type { SpecReference } from "./spec-references.ts";

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
}

type Listener = () => void;

export class Host {
  backend: PersistenceBackend = "memory";
  private platform!: PlatformState;
  private gateway!: SqlGateway;
  private catalog!: SqlConnection;
  private engines = new Map<string, TableEngine>();
  private listeners = new Set<Listener>();
  private silent = false;
  private storeTables = new Map<string, string[]>();
  private catalogTables: string[] = [];
  private readonly records = new RecordService({
    resolvedSpec: () => this.resolvedSpec(),
    queryContext: () => this.queryContext(),
    executionContext: () => this.context(),
    publish: () => this.persistAndEmit(),
  });
  private readonly specs = new SpecService({
    app: () => this.app(),
    space: () => this.space(),
    apps: () => this.apps(),
    resolvedSpec: () => this.resolvedSpec(),
    commit: (changes) => this.commitSpecs(changes),
  });

  static async open(options: HostOptions = {}): Promise<Host> {
    const host = new Host();
    host.gateway = options.gateway ?? (await openSqlGateway());
    host.backend = host.gateway.backend;
    host.catalog = await host.gateway.open(CATALOG_DATABASE);
    await ensureCatalog(host.catalog);
    const loaded = await loadPlatform(host.catalog);
    if (loaded) {
      host.platform = loaded;
    } else {
      host.platform = seedPlatform();
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
  private async commitSpecs(changes: SpecChange[]): Promise<void> {
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
    return this.records.list(typeKey);
  }

  async getRecord(typeKey: string, id: string): Promise<RecordValue | null> {
    return this.records.get(typeKey, id);
  }

  async create(typeKey: string, values: Record<string, unknown>): Promise<RecordValue> {
    return this.records.create(typeKey, values);
  }

  async update(typeKey: string, id: string, values: Record<string, unknown>): Promise<RecordValue> {
    return this.records.update(typeKey, id, values);
  }

  async transition(typeKey: string, id: string, transitionKey: string): Promise<RecordValue> {
    return this.records.transition(typeKey, id, transitionKey);
  }

  async remove(typeKey: string, id: string): Promise<void> {
    return this.records.remove(typeKey, id);
  }

  async queryView(
    view: string | ViewDef,
    expose?: Record<string, unknown>,
    context?: ViewRunContext,
  ): Promise<Array<Record<string, unknown>>> {
    return this.records.query(view, expose, context);
  }

  async invoke(workflowKey: string, input: Record<string, unknown> = {}): Promise<WorkflowRun> {
    return this.records.invoke(workflowKey, input);
  }

  async upsertType(draft: TypeDraft & { key: string }): Promise<TypeDef> {
    return this.specs.upsertType(draft);
  }

  async renameType(from: string, to: string): Promise<TypeDef> {
    return this.specs.renameType(from, to);
  }

  async deleteType(key: string): Promise<void> {
    return this.specs.deleteType(key);
  }

  async renameField(typeKey: string, from: string, to: string): Promise<FieldDef> {
    return this.specs.renameField(typeKey, from, to);
  }

  async deleteField(typeKey: string, key: string): Promise<void> {
    return this.specs.deleteField(typeKey, key);
  }

  async submitForm(
    formKey: string,
    values: Record<string, unknown>,
    recordId?: string,
  ): Promise<RecordValue | null> {
    return this.records.submitForm(formKey, values, recordId);
  }

  async upsertField(
    typeKey: string,
    field: Partial<FieldDef> & { key: string },
  ): Promise<FieldDef> {
    return this.specs.upsertField(typeKey, field);
  }

  async reorderFields(typeKey: string, keys: string[]): Promise<TypeDef> {
    return this.specs.reorderFields(typeKey, keys);
  }

  async upsertView(draft: Partial<ViewDef> & { key: string }): Promise<ViewDef> {
    return this.specs.upsertView(draft);
  }

  async upsertForm(draft: FormDraft & { key: string }): Promise<FormDef> {
    return this.specs.upsertForm(draft);
  }

  async upsertWorkflow(draft: Partial<WorkflowDef> & { key: string }): Promise<WorkflowDef> {
    return this.specs.upsertWorkflow(draft);
  }

  async upsertPage(draft: Partial<PageDef> & { key: string }): Promise<PageDef> {
    return this.specs.upsertPage(draft);
  }

  async deleteView(key: string): Promise<void> {
    return this.specs.deleteView(key);
  }

  async deleteForm(key: string): Promise<void> {
    return this.specs.deleteForm(key);
  }

  async deleteWorkflow(key: string): Promise<void> {
    return this.specs.deleteWorkflow(key);
  }

  async replaceAuthoredPages(pages: PageDef[]): Promise<void> {
    return this.specs.replaceAuthoredPages(pages);
  }

  async deletePage(key: string): Promise<void> {
    return this.specs.deletePage(key);
  }

  async applySpec(input: unknown): Promise<AppSpec> {
    return this.specs.apply(input);
  }

  async replaceSpecText(text: string): Promise<AppSpec> {
    return this.specs.replaceText(text);
  }

  exportJson(): string {
    return this.specs.exportJson();
  }

  exportYaml(): string {
    return this.specs.exportYaml();
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

  fieldReferences(
    typeKey: string,
    fieldKey: string,
    candidate?: { owner: SpaceState; spec: AppSpec },
  ): SpecReference[] {
    return this.specs.fieldReferences(typeKey, fieldKey, candidate);
  }

  typeReferences(typeKey: string): SpecReference[] {
    return this.specs.typeReferences(typeKey);
  }
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
