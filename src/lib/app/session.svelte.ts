import type { Actor, Permission } from "@jthum/framework/kernel";
import { LOCAL_BROWSER_ENVIRONMENT, PERMISSIONS } from "@jthum/framework/kernel";
import type { Spec } from "@jthum/framework/spec";
import { SPACE_ACCENT_KEYS, type SpaceAccent } from "$lib/app/appearance.ts";
import { seedApp } from "./app-templates.ts";
import { readSelection, writeSelection } from "./selection.ts";
import { readLoginRealm, rememberLoginRealm } from "./login-realm.ts";
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
  type AppContext,
} from "$lib/framework/bootstrap.ts";
import { SERVER_MODE } from "./deployment.ts";
import { loadRemoteSnapshot, remoteContext, serverRequest } from "./remote.ts";
import type { RemoteSnapshot } from "./remote-contract.ts";
import { readJsonResponse } from "@jthum/framework-http";
import { FrameworkError } from "@jthum/framework/errors";
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
import { createAssistantTools } from "$lib/inference/assistant-tools.ts";
import { createInferenceRuntime } from "$lib/inference/runtime.ts";
import { browserSecretCipher } from "$lib/framework/secrets.ts";

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
  framework = $state.raw<AppContext | null>(null);
  loginRequired = $state(false);
  setupRequired = $state(false);
  permissions = $state.raw<{
    readonly space: readonly Permission[];
    readonly app: readonly Permission[];
  }>({ space: PERMISSIONS, app: PERMISSIONS });
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
let remoteSpec: Spec | null = null;
let remoteRevision: number | undefined;
let remotePoll: ReturnType<typeof setInterval> | undefined;
let remoteBridge: WebMcpBridge | undefined;
let remoteEpoch = 0;
let polling = false;
const REMOTE_SELECTION_KEY = "server-app-selection";
hot?.dispose(() => {
  if (remotePoll) clearInterval(remotePoll);
  remoteBridge?.stop();
  live?.bridge?.stop();
  hot.data.live = live;
});
function current(): LiveRuntime {
  if (!live) throw new Error("The runtime is not ready.");
  return live;
}
export function publishToolSpec(appId: string, spec: Spec): void {
  if (SERVER_MODE) {
    if (appId !== session.app?.id) return;
    remoteSpec = spec;
    session.revision += 1;
    listeners.forEach((listener) => listener());
    return;
  }
  if (!live || appId !== live.framework.app.id) return;
  live.spec = spec;
  session.revision += 1;
  listeners.forEach((listener) => listener());
}
export const toolContext: ToolContext = {
  runtime: () => {
    if (!session.framework) throw new Error("The runtime is not ready.");
    return session.framework;
  },
  spec: () => {
    const spec = SERVER_MODE ? remoteSpec : current().spec;
    if (!spec) throw new Error("The runtime is not ready.");
    return spec;
  },
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
  if (SERVER_MODE) {
    const epoch = remoteEpoch;
    const snapshot = await loadRemoteSnapshot(session.framework?.selection);
    if (epoch === remoteEpoch) applyRemoteSnapshot(snapshot);
    return;
  }
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
  if (SERVER_MODE) {
    booting ??= bootRemote();
    return booting;
  }
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
      const assistantTools = createAssistantTools(toolContext);
      opened = await openRuntime({
        preferredSelection: readSelection(localStorage),
        kernel: {
          environment: {
            ...LOCAL_BROWSER_ENVIRONMENT,
            durableRuleExecution: true,
            inference: true,
          },
          persistence: createKernelSqlitePersistence(gateway),
          inference: createInferenceRuntime({
            assistantTools,
          }),
          secretCipher: browserSecretCipher(localStorage),
          inferenceTools: [assistantTools],
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
  if (SERVER_MODE) {
    await remoteCommand("updateProfile", input);
    return;
  }
  const runtime = current();
  await runtime.framework.spaceClient.updateActor(runtime.framework.actorId, input);
  await publishContext(runtime);
}
export async function updateSpaceSettings(name: string, accent: SpaceAccent): Promise<void> {
  if (SERVER_MODE) {
    await remoteCommand("renameSpace", { name, accent });
    return;
  }
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
  if (SERVER_MODE) {
    await selectRemote({ spaceId: session.space?.id, appId: id });
    return;
  }
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
  if (SERVER_MODE) {
    await remoteCommand("createApp", { name, ...(template ? { template } : {}) });
    return;
  }
  const runtime = current();
  const app = await seedApp(runtime.framework, name, template);
  runtime.framework = { ...runtime.framework, ...app };
  runtime.spec = app.app.spec;
  await publishContext(runtime);
}
export async function renameApp(name: string): Promise<void> {
  if (SERVER_MODE) {
    await remoteCommand("renameApp", { name });
    return;
  }
  const runtime = current();
  const app = await updateAppName(runtime.framework.kernel, runtime.framework, name);
  runtime.framework = { ...runtime.framework, ...app };
  await publishContext(runtime);
}
export async function deleteApp(id: string): Promise<void> {
  if (SERVER_MODE) {
    await remoteCommand("deleteApp", { id });
    return;
  }
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
  if (SERVER_MODE) {
    await selectRemote({ spaceId: id });
    return;
  }
  const runtime = current();
  const actorId = runtime.framework.localActors[id];
  if (!actorId) throw new Error("Space has no locally issued User on this device.");
  const selected = await resolveSpace(runtime.framework.kernel, id, actorId);
  runtime.framework = { ...runtime.framework, ...selected };
  runtime.spec = selected.app.spec;
  await publishContext(runtime);
}
export async function createSpace(name: string): Promise<void> {
  if (SERVER_MODE) {
    await remoteCommand("createSpace", { name });
    return;
  }
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
  if (SERVER_MODE) throw new Error("Local reset is unavailable for server storage.");
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

function applyRemoteSnapshot(snapshot: RemoteSnapshot): void {
  rememberLoginRealm(sessionStorage, snapshot.realmId);
  session.framework = remoteContext(snapshot);
  session.permissions = snapshot.permissions;
  session.actor = snapshot.actor;
  session.actors = snapshot.actors;
  session.app = { id: snapshot.app.id, name: snapshot.app.name };
  session.space = { id: snapshot.space.id, name: snapshot.space.name };
  session.apps = snapshot.apps.map(({ id, name }) => ({ id, name }));
  session.spaces = snapshot.spaces.map(({ id, name }) => ({ id, name }));
  const appearance = snapshot.space.spec.meta?.appearance;
  session.accent =
    appearance &&
    typeof appearance === "object" &&
    !Array.isArray(appearance) &&
    "accent" in appearance &&
    SPACE_ACCENT_KEYS.includes(appearance.accent as SpaceAccent)
      ? (appearance.accent as SpaceAccent)
      : "blue";
  remoteSpec = snapshot.app.spec;
  remoteRevision = snapshot.revision;
  session.diagnostics = {
    backend: "server",
    engine: "SQLite",
    database: CATALOG_DATABASE,
    databases: describeDatabases(snapshot.databases, [snapshot.space, ...snapshot.apps]),
  };
  writeSelection(localStorage, snapshot.selection, REMOTE_SELECTION_KEY);
  session.webmcp = webmcpSupported();
  session.webmcpToolMode = getWebMcpAppToolMode();
  session.ready = true;
  session.loginRequired = false;
  session.setupRequired = false;
  session.error = null;
  session.revision += 1;
  listeners.forEach((listener) => listener());
}

async function remoteCommand(command: string, input: Record<string, unknown>): Promise<void> {
  await selectRemote(session.framework?.selection, command, input);
}

async function selectRemote(
  selection?: Partial<AppContext["selection"]>,
  command = "snapshot",
  input: Record<string, unknown> = {},
): Promise<void> {
  const epoch = ++remoteEpoch;
  const snapshot = await loadRemoteSnapshot(selection, command, input);
  if (epoch === remoteEpoch) applyRemoteSnapshot(snapshot);
}

async function bootRemote(): Promise<void> {
  try {
    const selection = readSelection(localStorage, REMOTE_SELECTION_KEY);
    let snapshot: RemoteSnapshot;
    try {
      snapshot = await loadRemoteSnapshot(selection);
    } catch (error) {
      if (
        !selection ||
        !(error instanceof FrameworkError) ||
        !["AUTH.REQUIRED", "RESOURCE.NOT_FOUND", "PERMISSION.DENIED"].includes(error.code)
      )
        throw error;
      snapshot = await loadRemoteSnapshot();
    }
    applyRemoteSnapshot(snapshot);
    remoteBridge?.stop();
    remoteBridge = createWebMcpBridge({
      getTools: (mode) => buildTools(toolContext, { appTools: mode }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    if (remotePoll) clearInterval(remotePoll);
    remotePoll = setInterval(() => {
      void pollRemote();
    }, 3000);
  } catch (error) {
    remoteFailure(error);
  }
}

async function pollRemote(): Promise<void> {
  if (polling || !session.ready || document.visibilityState === "hidden") return;
  polling = true;
  const epoch = remoteEpoch;
  try {
    const revision = await serverRequest("revision", {}, session.framework?.selection);
    if (revision !== remoteRevision) {
      const snapshot = await loadRemoteSnapshot(session.framework?.selection);
      if (epoch === remoteEpoch) applyRemoteSnapshot(snapshot);
    }
  } catch (error) {
    if (
      epoch === remoteEpoch &&
      error instanceof FrameworkError &&
      (error.code.startsWith("AUTH.") ||
        error.code === "PERMISSION.DENIED" ||
        error.code === "RESOURCE.NOT_FOUND")
    ) {
      if (error.code === "RESOURCE.NOT_FOUND") {
        try {
          const snapshot = await loadRemoteSnapshot({ spaceId: session.space?.id });
          if (epoch === remoteEpoch) applyRemoteSnapshot(snapshot);
        } catch (cause) {
          remoteFailure(cause);
        }
      } else remoteFailure(error);
    }
  } finally {
    polling = false;
  }
}

function remoteFailure(error: unknown): void {
  remoteEpoch += 1;
  remoteSpec = null;
  remoteRevision = undefined;
  remoteBridge?.stop();
  if (remotePoll) clearInterval(remotePoll);
  session.ready = false;
  session.framework = null;
  session.permissions = { space: [], app: [] };
  if (error instanceof FrameworkError && error.code === "AUTH.SETUP_REQUIRED") {
    session.setupRequired = true;
    session.loginRequired = false;
    session.error = null;
  } else if (error instanceof FrameworkError && error.code.startsWith("AUTH.")) {
    session.loginRequired = true;
    session.error = null;
  } else
    session.error = error instanceof Error ? error.message : "Unable to connect to the server.";
}

export async function login(username: string, password: string): Promise<void> {
  const realmId = readLoginRealm(sessionStorage, location.search);
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      ...(realmId ? { realmId } : {}),
    }),
  });
  await readJsonResponse(response);
  booting = null;
  await boot();
}

export async function setup(input: {
  name: string;
  username: string;
  password: string;
  spaceName?: string;
}): Promise<void> {
  await readJsonResponse(
    await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  session.setupRequired = false;
  session.error = null;
  booting = null;
  await boot();
}

export async function logout(): Promise<void> {
  try {
    await readJsonResponse(await fetch("/api/logout", { method: "POST" }));
  } catch (error) {
    if (!(error instanceof FrameworkError) || error.code !== "AUTH.REQUIRED") throw error;
  }
  if (remotePoll) clearInterval(remotePoll);
  remoteBridge?.stop();
  remoteEpoch += 1;
  booting = null;
  session.ready = false;
  session.framework = null;
  remoteSpec = null;
  remoteRevision = undefined;
  session.permissions = { space: [], app: [] };
  session.loginRequired = true;
}

/** Follow explicit selection tools without treating remote inference as a global server session. */
export async function followAssistantSelection(value: unknown): Promise<void> {
  if (!SERVER_MODE || !value || typeof value !== "object" || !("selection" in value)) return;
  const selection = value.selection;
  if (
    !selection ||
    typeof selection !== "object" ||
    !("spaceId" in selection) ||
    !("appId" in selection) ||
    typeof selection.spaceId !== "string" ||
    typeof selection.appId !== "string"
  )
    return;
  await selectRemote({ spaceId: selection.spaceId, appId: selection.appId });
}
