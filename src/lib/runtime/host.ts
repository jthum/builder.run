import { applyDefaults, effectiveSpec } from "./defaults.ts";
import { MemoryEngine, type TableEngine } from "./engine.ts";
import { invokeFlow, matchingTriggers, type FlowRun } from "./flows.ts";
import { createId, labelFromKey, slugify } from "./ids.ts";
import {
  cloneSpec,
  emptySpec,
  normalizeSpec,
  type Actor,
  type AppSpec,
  type ExecutionContext,
  type FieldDef,
  type FlowDef,
  type FormDef,
  type PageDef,
  type RecordValue,
  type StoreDef,
  type TypeDef,
  type ViewDef,
} from "./model.ts";
import {
  detectBackend,
  readPlatformJson,
  writePlatformJson,
  type PersistenceBackend,
} from "./persist.ts";
import { executeView, findType, type QueryContext } from "./query.ts";
import { createRecord, deleteRecord, updateRecord, type ChangeEvent } from "./records.ts";
import { directoryTypes, newWorkspaceSpec, sampleApps } from "./samples.ts";
import { reconcileStore } from "./schema.ts";
import { specFromText, specToJson, specToYaml } from "./serialize.ts";

export interface WorkspaceState {
  id: string;
  name: string;
  spec: AppSpec;
}

export interface EnvironmentState {
  id: string;
  name: string;
  actors: Actor[];
  stores: StoreDef[];
  sharedTypes: TypeDef[];
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
}

export interface PlatformState {
  version: 1;
  activeEnvironmentId: string;
  environments: EnvironmentState[];
  storeData: Record<string, Record<string, RecordValue[]>>;
}

export interface HostSnapshot {
  backend: PersistenceBackend;
  webmcp: boolean;
  environment: EnvironmentState;
  workspace: WorkspaceState;
  spec: AppSpec;
  sharedTypes: TypeDef[];
  actor: Actor;
  environments: Array<{ id: string; name: string }>;
  workspaces: Array<{ id: string; name: string }>;
}

export interface HostOptions {
  backend?: PersistenceBackend;
  persist?: boolean;
}

type Listener = () => void;

export class Host {
  backend: PersistenceBackend = "memory";
  private platform!: PlatformState;
  private engines = new Map<string, TableEngine>();
  private listeners = new Set<Listener>();
  private persistEnabled = true;
  private writing = false;

  static async open(options: HostOptions = {}): Promise<Host> {
    const host = new Host();
    host.persistEnabled = options.persist !== false;
    host.backend =
      options.backend ?? (typeof window === "undefined" ? "memory" : await detectBackend());
    const raw = host.persistEnabled ? await readPlatformJson(host.backend) : null;
    if (raw) {
      host.platform = JSON.parse(raw) as PlatformState;
    } else {
      host.platform = seedPlatform();
    }
    await host.bootEngines();
    await host.reconcileAll();
    if (!raw && host.persistEnabled) await host.save();
    return host;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
    if (this.persistEnabled && !this.writing) {
      this.writing = true;
      void this.save().finally(() => {
        this.writing = false;
      });
    }
  }

  private async save(): Promise<void> {
    this.platform.storeData = {};
    for (const [key, engine] of this.engines) {
      this.platform.storeData[key] = await engine.dump();
    }
    await writePlatformJson(this.backend, JSON.stringify(this.platform));
  }

  private async dumpEngines(): Promise<void> {
    if (this.engines.size === 0) return;
    this.platform.storeData ??= {};
    for (const [key, engine] of this.engines) {
      this.platform.storeData[key] = await engine.dump();
    }
  }

  private async bootEngines(): Promise<void> {
    await this.dumpEngines();
    this.engines.clear();
    const env = this.environment();
    for (const store of env.stores) {
      const engineKey = this.engineKey(store.key);
      const engine = new MemoryEngine(engineKey);
      const dumped = this.platform.storeData?.[engineKey];
      if (dumped) await engine.load(dumped);
      this.engines.set(engineKey, engine);
    }
  }

  private engineKey(storeKey: string): string {
    const env = this.environment();
    if (storeKey === "local") return `${env.id}:${env.activeWorkspaceId}:local`;
    return `${env.id}:${storeKey}`;
  }

  private async reconcileAll(): Promise<void> {
    const env = this.environment();
    const sharedEngine = this.engines.get(this.engineKey("directory"));
    if (sharedEngine) {
      await reconcileStore(
        sharedEngine,
        env.sharedTypes.filter((type) => type.store === "directory"),
      );
    }
    const local = this.engines.get(this.engineKey("local"));
    if (local) {
      const spec = this.resolvedSpec();
      await reconcileStore(
        local,
        spec.types.filter((type) => type.store === "local"),
      );
    }
  }

  environment(): EnvironmentState {
    const env = this.platform.environments.find(
      (item) => item.id === this.platform.activeEnvironmentId,
    );
    if (!env) throw new Error("No active environment");
    return env;
  }

  workspace(): WorkspaceState {
    const env = this.environment();
    const workspace = env.workspaces.find((item) => item.id === env.activeWorkspaceId);
    if (!workspace) throw new Error("No active workspace");
    return workspace;
  }

  actor(): Actor {
    const env = this.environment();
    return env.actors.find((item) => item.kind === "human") ?? env.actors[0];
  }

  context(): ExecutionContext {
    return {
      actorId: this.actor().id,
      environmentId: this.environment().id,
      workspaceId: this.workspace().id,
    };
  }

  resolvedSpec(): AppSpec {
    const workspace = this.workspace();
    const env = this.environment();
    const spec = cloneSpec(workspace.spec);
    const localKeys = new Set(spec.types.map((type) => type.key));
    spec.types = [...env.sharedTypes.filter((type) => !localKeys.has(type.key)), ...spec.types];
    if (!spec.stores.some((store) => store.key === "directory")) {
      spec.stores.unshift(
        env.stores.find((store) => store.key === "directory") ?? {
          id: createId("sto"),
          key: "directory",
          label: "Directory",
          kind: "shared",
        },
      );
    }
    return applyDefaults(spec);
  }

  snapshot(): HostSnapshot {
    const env = this.environment();
    const workspace = this.workspace();
    return {
      backend: this.backend,
      webmcp: typeof document !== "undefined" && Boolean(document.modelContext),
      environment: env,
      workspace,
      spec: this.resolvedSpec(),
      sharedTypes: env.sharedTypes,
      actor: this.actor(),
      environments: this.platform.environments.map((item) => ({ id: item.id, name: item.name })),
      workspaces: env.workspaces.map((item) => ({ id: item.id, name: item.name })),
    };
  }

  queryContext(): QueryContext {
    const spec = this.resolvedSpec();
    return {
      spec,
      sharedTypes: this.environment().sharedTypes,
      engineFor: (storeKey) => {
        const engine = this.engines.get(this.engineKey(storeKey));
        if (!engine) throw new Error(`Store ${storeKey} is not open`);
        return engine;
      },
    };
  }

  async listRecords(typeKey: string): Promise<RecordValue[]> {
    const ctx = this.queryContext();
    const type = findType(ctx, typeKey);
    if (!type) return [];
    return ctx.engineFor(type.store).select(type.key, { orderBy: { updated_at: "desc" } });
  }

  async getRecord(typeKey: string, id: string): Promise<RecordValue | null> {
    const ctx = this.queryContext();
    const type = findType(ctx, typeKey);
    if (!type) return null;
    return ctx.engineFor(type.store).get(type.key, id);
  }

  async create(typeKey: string, values: Record<string, unknown>): Promise<RecordValue> {
    const ctx = this.queryContext();
    const result = await createRecord(ctx, typeKey, values, this.context());
    await this.afterChanges([result.change]);
    return result.record;
  }

  async update(typeKey: string, id: string, values: Record<string, unknown>): Promise<RecordValue> {
    const ctx = this.queryContext();
    const result = await updateRecord(ctx, typeKey, id, values, this.context());
    await this.afterChanges([result.change]);
    return result.record;
  }

  async remove(typeKey: string, id: string): Promise<void> {
    const ctx = this.queryContext();
    const result = await deleteRecord(ctx, typeKey, id);
    await this.afterChanges([result.change]);
  }

  async queryView(viewKey: string): Promise<Array<Record<string, unknown>>> {
    const spec = this.resolvedSpec();
    const view = spec.views.find((item) => item.key === viewKey);
    if (!view) return [];
    return executeView(this.queryContext(), view);
  }

  async invoke(flowKey: string, input: Record<string, unknown> = {}): Promise<FlowRun> {
    const spec = this.resolvedSpec();
    const flow = spec.flows.find((item) => item.key === flowKey);
    if (!flow) throw new Error(`Unknown flow ${flowKey}`);
    const ctx = this.queryContext();
    const run = await invokeFlow(ctx, flow, input, this.context(), {
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
    this.emit();
  }

  async upsertType(draft: Partial<TypeDef> & { key: string }): Promise<TypeDef> {
    const workspace = this.workspace();
    const env = this.environment();
    const store = draft.store || "local";
    const spec = store === "directory" ? typespecFromShared(env) : workspace.spec;
    const next = normalizeSpec(
      {
        ...spec,
        types: {
          ...Object.fromEntries(spec.types.map((type) => [type.key, type])),
          [draft.key]: draft,
        },
      },
      spec,
    );
    const type = next.types.find((item) => item.key === draft.key) as TypeDef;
    if (store === "directory") {
      env.sharedTypes = next.types.filter((item) => item.store === "directory");
    } else {
      workspace.spec = applyDefaults(next);
    }
    await this.reconcileAll();
    this.emit();
    return type;
  }

  async deleteType(key: string): Promise<void> {
    const workspace = this.workspace();
    workspace.spec.types = workspace.spec.types.filter((type) => type.key !== key);
    workspace.spec = applyDefaults(workspace.spec);
    const env = this.environment();
    env.sharedTypes = env.sharedTypes.filter((type) => type.key !== key);
    await this.reconcileAll();
    this.emit();
  }

  async upsertField(
    typeKey: string,
    field: Partial<FieldDef> & { key: string },
  ): Promise<FieldDef> {
    const type = this.findWritableType(typeKey);
    const existing = type.fields.find((item) => item.key === field.key);
    const next = existing
      ? type.fields.map((item) =>
          item.key === field.key ? { ...item, ...field, id: item.id } : item,
        )
      : [
          ...type.fields,
          {
            id: createId("fld"),
            label: labelFromKey(field.key),
            type: "text",
            ...field,
          } as FieldDef,
        ];
    type.fields = next;
    await this.reconcileAll();
    this.emit();
    return next.find((item) => item.key === field.key) as FieldDef;
  }

  async upsertView(draft: Partial<ViewDef> & { key: string }): Promise<ViewDef> {
    const spec = this.workspace().spec;
    const views = upsertNamed(spec.views, {
      id: createId("vw"),
      label: labelFromKey(draft.key),
      source: "",
      fields: [],
      ...draft,
    });
    this.workspace().spec = applyDefaults({ ...spec, views });
    this.emit();
    return views.find((item) => item.key === draft.key) as ViewDef;
  }

  async upsertForm(draft: Partial<FormDef> & { key: string }): Promise<FormDef> {
    const spec = this.workspace().spec;
    const forms = upsertNamed(spec.forms, {
      id: createId("frm"),
      label: labelFromKey(draft.key),
      type: "",
      fields: [],
      mode: "custom",
      ...draft,
    } as FormDef);
    this.workspace().spec = applyDefaults({ ...spec, forms });
    this.emit();
    return forms.find((item) => item.key === draft.key) as FormDef;
  }

  async upsertFlow(draft: Partial<FlowDef> & { key: string }): Promise<FlowDef> {
    const spec = this.workspace().spec;
    const flows = upsertNamed(spec.flows, {
      id: createId("flw"),
      label: labelFromKey(draft.key),
      steps: [],
      ...draft,
    });
    this.workspace().spec = { ...spec, flows };
    this.emit();
    return flows.find((item) => item.key === draft.key) as FlowDef;
  }

  async upsertPage(draft: Partial<PageDef> & { key: string }): Promise<PageDef> {
    const spec = this.workspace().spec;
    const pages = upsertNamed(spec.pages, {
      id: createId("pg"),
      label: labelFromKey(draft.key),
      blocks: [],
      ...draft,
    });
    this.workspace().spec = applyDefaults({ ...spec, pages });
    this.emit();
    return pages.find((item) => item.key === draft.key) as PageDef;
  }

  async applySpec(input: unknown): Promise<AppSpec> {
    const workspace = this.workspace();
    workspace.spec = applyDefaults(normalizeSpec(input as never, workspace.spec));
    await this.reconcileAll();
    this.emit();
    return this.resolvedSpec();
  }

  async replaceSpecText(text: string): Promise<AppSpec> {
    return this.applySpec(specFromText(text));
  }

  exportJson(): string {
    return specToJson(effectiveSpec(this.workspace().spec));
  }

  exportYaml(): string {
    return specToYaml(effectiveSpec(this.workspace().spec));
  }

  async createWorkspace(name: string, spec?: AppSpec): Promise<WorkspaceState> {
    const env = this.environment();
    const workspace: WorkspaceState = {
      id: createId("wsp"),
      name,
      spec: spec ? applyDefaults(normalizeSpec(spec)) : newWorkspaceSpec(slugify(name), name),
    };
    env.workspaces.push(workspace);
    env.activeWorkspaceId = workspace.id;
    await this.bootEngines();
    await this.reconcileAll();
    this.emit();
    return workspace;
  }

  async switchWorkspace(id: string): Promise<void> {
    const env = this.environment();
    if (!env.workspaces.some((item) => item.id === id)) throw new Error("Unknown workspace");
    env.activeWorkspaceId = id;
    await this.bootEngines();
    this.emit();
  }

  async createEnvironment(name: string): Promise<EnvironmentState> {
    const env = seedEnvironment(name);
    this.platform.environments.push(env);
    this.platform.activeEnvironmentId = env.id;
    await this.bootEngines();
    await this.reconcileAll();
    this.emit();
    return env;
  }

  async switchEnvironment(id: string): Promise<void> {
    if (!this.platform.environments.some((item) => item.id === id))
      throw new Error("Unknown environment");
    this.platform.activeEnvironmentId = id;
    await this.bootEngines();
    this.emit();
  }

  async loadSample(key: string): Promise<WorkspaceState> {
    const sample = sampleApps.find((item) => item.key === key);
    if (!sample) throw new Error(`Unknown sample ${key}`);
    return this.createWorkspace(sample.label, sample.spec);
  }

  private findWritableType(typeKey: string): TypeDef {
    const workspace = this.workspace();
    const local = workspace.spec.types.find((type) => type.key === typeKey);
    if (local) return local;
    const shared = this.environment().sharedTypes.find((type) => type.key === typeKey);
    if (shared) return shared;
    throw new Error(`Unknown type ${typeKey}`);
  }
}

function upsertNamed<T extends { key: string }>(list: T[], item: T): T[] {
  if (list.some((existing) => existing.key === item.key)) {
    return list.map((existing) =>
      existing.key === item.key ? { ...existing, ...item } : existing,
    );
  }
  return [...list, item];
}

function typespecFromShared(env: EnvironmentState): AppSpec {
  const spec = emptySpec("directory", "Directory");
  spec.stores = env.stores;
  spec.types = env.sharedTypes;
  return spec;
}

function seedPlatform(): PlatformState {
  const env = seedEnvironment("Personal");
  return {
    version: 1,
    activeEnvironmentId: env.id,
    environments: [env],
    storeData: {},
  };
}

function seedEnvironment(name: string): EnvironmentState {
  const human: Actor = { id: createId("act"), name: "You", kind: "human", roles: ["admin"] };
  const system: Actor = { id: createId("act"), name: "System", kind: "system", roles: ["admin"] };
  const workspace: WorkspaceState = {
    id: createId("wsp"),
    name: "Home",
    spec: newWorkspaceSpec("home", "Home"),
  };
  return {
    id: createId("env"),
    name,
    actors: [human, system],
    stores: [
      { id: createId("sto"), key: "directory", label: "Directory", kind: "shared" },
      { id: createId("sto"), key: "local", label: "Workspace", kind: "workspace" },
    ],
    sharedTypes: directoryTypes(),
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
  };
}
