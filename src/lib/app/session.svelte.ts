import type { Actor } from "@jthum/framework/kernel";
import { LOCAL_BROWSER_ENVIRONMENT } from "@jthum/framework/kernel";
import type { Spec } from "@jthum/framework/spec";
import { SPACE_ACCENT_KEYS, type SpaceAccent } from "$lib/app/appearance.ts";
import { seedApp } from "./app-templates.ts";
import { readSelection, writeSelection } from "./selection.ts";
import {
  createSpace as seedSpace,
  deleteApp as removeApp,
  emptySpec,
  listApps,
  openRuntime,
  resolveApp,
  resolveSpace,
  renameApp as updateAppName,
  type OpenedRuntime,
} from "$lib/framework/bootstrap.ts";
import {
  createKernelSqlitePersistence,
  CATALOG_DATABASE,
  workspaceDatabaseName,
} from "$lib/framework/sqlite.ts";
import { openSqlGateway, type SqlGateway } from "$lib/runtime/persistence/sqlite/gateway.ts";
import {
  clearStorageLockReload,
  isStorageLocked,
  takeStorageLockReload,
} from "$lib/runtime/persistence/sqlite/storage-lock.ts";
import {
  buildTools,
  createWebMcpBridge,
  getWebMcpAppToolMode,
  setWebMcpAppToolMode,
  webmcpSupported,
  type WebMcpAppToolMode,
  type ToolContext,
  type WebMcpBridge,
} from "./webmcp.ts";
import { createAuthoringInferenceTools } from "$lib/inference/authoring-tools.ts";
import { createBrowserInferenceRuntime } from "$lib/inference/runtime.ts";
import { browserSecrets } from "$lib/framework/secrets.ts";

export interface AppSummary {
  readonly id: string;
  readonly name: string;
}
export interface SpaceSummary {
  readonly id: string;
  readonly name: string;
}
export interface RuntimeDiagnostics {
  readonly backend: string;
  readonly engine: string;
  readonly database: string;
  readonly databases: readonly RuntimeDatabaseDiagnostic[];
  readonly capacity?: {
    readonly used: number;
    readonly total: number;
  };
}
export interface RuntimeDatabaseDiagnostic {
  readonly name: string;
  readonly label: string;
  readonly kind: "control" | "space" | "app" | "scope" | "database";
  readonly bytes?: number;
  readonly open: boolean;
}
type ProfileActor = Actor & { readonly roles: readonly string[] };
class SessionState {
  ready = $state(false);
  framework = $state.raw<OpenedRuntime | null>(null);
  diagnostics = $state.raw<RuntimeDiagnostics | null>(null);
  app = $state.raw<AppSummary | null>(null);
  apps = $state.raw<readonly AppSummary[]>([]);
  space = $state.raw<SpaceSummary | null>(null);
  spaces = $state.raw<readonly SpaceSummary[]>([]);
  actor = $state.raw<ProfileActor | null>(null);
  actors = $state.raw<readonly ProfileActor[]>([]);
  accent = $state<SpaceAccent>("blue");
  error = $state<string | null>(null);
  revision = $state(0);
  webmcp = $state(false);
  webmcpToolMode = $state<WebMcpAppToolMode>("compact");
}
export const session = new SessionState();
type LiveRuntime = {
  framework: OpenedRuntime;
  gateway: SqlGateway;
  bridge?: WebMcpBridge;
  spec: Spec;
};
const listeners = new Set<() => void>();
const hot = import.meta.hot;
let live: LiveRuntime | null = hot?.data.live ?? null;
let booting: Promise<void> | null = null;
hot?.dispose(() => {
  live?.bridge?.stop();
  hot.data.live = live;
});
function current(): LiveRuntime {
  if (!live) throw new Error("The runtime is not ready.");
  return live;
}
export function publishToolSpec(appId: string, spec: Spec): void {
  if (!live || appId !== live.framework.app.id) return;
  live.spec = spec;
  session.revision += 1;
  listeners.forEach((listener) => listener());
}
export const toolContext: ToolContext = {
  runtime: () => current().framework,
  spec: () => current().spec,
  changed: async () => refreshContext(),
  createApp,
  selectApp,
  deleteApp,
  createSpace,
};
function connectTools(runtime: LiveRuntime): void {
  runtime.bridge?.stop();
  runtime.bridge = createWebMcpBridge({
    getTools: (mode) => buildTools(toolContext, { appTools: mode }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

async function refreshContext(): Promise<void> {
  const runtime = current();
  const previous = runtime.framework;
  const [space, app] = await Promise.all([
    previous.spaceClient.getWorkspace(),
    previous.appClient.getWorkspace(),
  ]);
  if (live !== runtime || runtime.framework !== previous) return;
  runtime.framework = { ...previous, space, app };
  runtime.spec = app.spec;
  await publishContext(runtime);
}
async function publishContext(runtime: LiveRuntime): Promise<void> {
  const framework = runtime.framework;
  const [actor, apps, spaces, actors, memberships, workspaces, storage] = await Promise.all([
    framework.spaceClient.getActor(framework.actorId),
    listApps(framework.kernel, framework.spaceContext),
    framework.kernel.listRootWorkspaces(framework.spaceContext),
    framework.kernel.listActorsByOrigin(framework.spaceContext, framework.space.id),
    framework.kernel.listMembershipsForWorkspace(framework.spaceContext, framework.space.id),
    framework.kernel.listWorkspacesByRoot(framework.spaceContext),
    runtime.gateway.inspect(),
  ]);
  if (runtime !== live || runtime.framework !== framework || !actor) return;
  const role = (id: string): readonly string[] =>
    memberships.find((member) => member.actorId === id)?.permissions.includes("manage")
      ? ["admin"]
      : ["member"];
  session.framework = framework;
  session.app = { id: framework.app.id, name: framework.app.name };
  session.apps = apps.map(({ id, name }) => ({ id, name }));
  session.space = { id: framework.space.id, name: framework.space.name };
  session.spaces = spaces.map(({ id, name }) => ({ id, name }));
  session.actor = { ...actor, roles: role(actor.id) };
  session.actors = actors.map((actor) => ({ ...actor, roles: role(actor.id) }));
  const appearance = framework.space.spec.meta?.appearance;
  session.accent = "blue";
  if (
    appearance &&
    typeof appearance === "object" &&
    !Array.isArray(appearance) &&
    "accent" in appearance &&
    SPACE_ACCENT_KEYS.includes(appearance.accent as SpaceAccent)
  )
    session.accent = appearance.accent as SpaceAccent;
  writeSelection(localStorage, framework.selection);
  session.diagnostics = {
    backend: runtime.gateway.backend,
    engine: "SQLite",
    database: CATALOG_DATABASE,
    databases: describeDatabases(storage.databases, workspaces),
    ...(storage.capacity ? { capacity: storage.capacity } : {}),
  };
  session.webmcp = webmcpSupported();
  session.webmcpToolMode = getWebMcpAppToolMode();
  session.revision += 1;
  listeners.forEach((listener) => listener());
}

function describeDatabases(
  databases: Awaited<ReturnType<SqlGateway["inspect"]>>["databases"],
  workspaces: Awaited<ReturnType<OpenedRuntime["kernel"]["listWorkspacesByRoot"]>>,
): RuntimeDatabaseDiagnostic[] {
  const workspaceNames = new Map(
    workspaces.map((workspace) => [
      workspaceDatabaseName(workspace.id),
      { label: workspace.name, kind: workspace.isRoot ? ("space" as const) : ("app" as const) },
    ]),
  );
  return databases
    .filter(({ name }) => name.endsWith(".db"))
    .map((database) => {
      if (database.name === CATALOG_DATABASE)
        return { ...database, label: "Catalog", kind: "control" as const };
      const workspace = workspaceNames.get(database.name);
      if (workspace) return { ...database, ...workspace };
      if (database.name.startsWith("catalog-s-"))
        return { ...database, label: "Module scope", kind: "scope" as const };
      return { ...database, label: "SQLite database", kind: "database" as const };
    });
}

export function boot(): Promise<void> {
  if (live) {
    booting ??= publishContext(live).then(() => {
      if (live) connectTools(live);
      session.ready = true;
    });
    return booting;
  }
  booting ??= (async () => {
    let opened: OpenedRuntime | undefined;
    try {
      const gateway = await openSqlGateway();
      opened = await openRuntime({
        preferredSelection: readSelection(localStorage),
        kernel: {
          environment: {
            ...LOCAL_BROWSER_ENVIRONMENT,
            durableRuleExecution: true,
            inference: true,
          },
          persistence: createKernelSqlitePersistence(gateway),
          inference: createBrowserInferenceRuntime(),
          secrets: browserSecrets(localStorage),
          inferenceTools: [createAuthoringInferenceTools(toolContext)],
        },
        seed: {
          spaceName: "Personal Space",
          appName: "Home",
          user: { name: "You" },
          spaceSpec: emptySpec("personal_space", "Personal Space"),
          appSpec: emptySpec("home", "Home"),
        },
      });
      live = { framework: opened, gateway, spec: opened.app.spec };
      await publishContext(live);
      connectTools(live);
      session.ready = true;
      session.error = null;
      clearStorageLockReload();
    } catch (error) {
      live?.bridge?.stop();
      live = null;
      await opened?.kernel.close();
      if (isStorageLocked(error) && takeStorageLockReload()) {
        location.reload();
        return;
      }
      session.error = error instanceof Error ? error.message : "Unable to open the local runtime.";
    }
  })();
  return booting;
}
export async function updateProfile(input: { name: string; email?: string }): Promise<void> {
  const runtime = current();
  await runtime.framework.spaceClient.updateActor(runtime.framework.actorId, input);
  await publishContext(runtime);
}
export async function updateSpaceSettings(name: string, accent: SpaceAccent): Promise<void> {
  const runtime = current();
  await runtime.framework.kernel.renameWorkspace(runtime.framework.spaceContext, { name });
  const space = await runtime.framework.spaceClient.getWorkspace();
  const appearance = space.spec.meta?.appearance;
  await runtime.framework.spaceClient.applySpec({
    ...space.spec,
    meta: {
      ...space.spec.meta,
      appearance: {
        ...(appearance && typeof appearance === "object" && !Array.isArray(appearance)
          ? appearance
          : {}),
        accent,
      },
    },
  });
  await refreshContext();
}
export async function selectApp(id: string): Promise<void> {
  const runtime = current();
  const selected = await resolveApp(
    runtime.framework.kernel,
    { spaceId: runtime.framework.space.id, appId: id },
    runtime.framework.actorId,
  );
  runtime.framework = { ...runtime.framework, ...selected };
  runtime.spec = selected.app.spec;
  await publishContext(runtime);
}
export async function createApp(name: string, template?: string | null): Promise<void> {
  const runtime = current();
  const app = await seedApp(runtime.framework, name, template);
  runtime.framework = { ...runtime.framework, ...app };
  runtime.spec = app.app.spec;
  await publishContext(runtime);
}
export async function renameApp(name: string): Promise<void> {
  const runtime = current();
  const app = await updateAppName(runtime.framework.kernel, runtime.framework, name);
  runtime.framework = { ...runtime.framework, ...app };
  await publishContext(runtime);
}
export async function deleteApp(id: string): Promise<void> {
  const runtime = current();
  const previous = runtime.framework;
  const fallback = await removeApp(previous.kernel, previous.spaceContext, id);
  const app =
    id === previous.app.id
      ? fallback
      : await resolveApp(previous.kernel, previous.selection, previous.actorId);
  runtime.framework = { ...previous, ...app };
  runtime.spec = app.app.spec;
  await publishContext(runtime);
}
export async function selectSpace(id: string): Promise<void> {
  const runtime = current();
  const actorId = runtime.framework.localActors[id];
  if (!actorId) throw new Error("Space has no locally issued User on this device.");
  const selected = await resolveSpace(runtime.framework.kernel, id, actorId);
  runtime.framework = { ...runtime.framework, ...selected };
  runtime.spec = selected.app.spec;
  await publishContext(runtime);
}
export async function createSpace(name: string): Promise<void> {
  const runtime = current();
  const selected = await seedSpace(runtime.framework.kernel, {
    spaceName: name,
    appName: "Home",
    user: { name: session.actor?.name ?? "You", email: session.actor?.email },
    spaceSpec: emptySpec("space", name),
    appSpec: emptySpec("home", "Home"),
  });
  runtime.framework = { ...runtime.framework, ...selected };
  runtime.framework = {
    ...runtime.framework,
    localActors: { ...runtime.framework.localActors, [selected.space.id]: selected.actorId },
  };
  runtime.spec = selected.app.spec;
  await publishContext(runtime);
}
export function configureWebMcpAppToolMode(mode: WebMcpAppToolMode): void {
  setWebMcpAppToolMode(mode);
  session.webmcpToolMode = mode;
  session.revision += 1;
}
/** Explicit development reset: remove this product's local persistence and reload. */
export async function wipeAllLocalData(): Promise<void> {
  const runtime = current();
  runtime.bridge?.stop();
  await runtime.framework.kernel.close();
  await runtime.gateway.wipe();
  localStorage.removeItem("app-selection");
  location.reload();
}
export const chrome: { newAppOpen: boolean; newAppPreset: string } = $state({
  newAppOpen: false,
  newAppPreset: "",
});
export function openNewApp(preset = "") {
  chrome.newAppPreset = preset;
  chrome.newAppOpen = true;
}
