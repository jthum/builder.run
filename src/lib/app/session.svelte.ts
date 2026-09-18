import { Host, type HostSnapshot } from "$lib/runtime/host.ts";
import type { Actor, AppSpec, TypeDef } from "$lib/runtime/model.ts";
import { SPACE_ACCENT_KEYS, type SpaceAccent } from "$lib/runtime/platform.ts";
import { sampleApps } from "$lib/runtime/samples.ts";
import { seedTemplateRecords } from "$lib/app/template-records.ts";
import {
  deleteApp as deleteFrameworkApp,
  openRuntime,
  renameApp as renameFrameworkApp,
  resolveProjectedApp,
  type OpenedRuntime,
} from "$lib/framework/bootstrap.ts";
import { LOCAL_BROWSER_ENVIRONMENT } from "@jthum/framework/kernel";
import { createKernelSqlitePersistence } from "$lib/framework/sqlite.ts";
import { openSqlGateway } from "$lib/runtime/persistence/sqlite/gateway.ts";
import {
  clearStorageLockReload,
  isStorageLocked,
  takeStorageLockReload,
} from "$lib/runtime/persistence/sqlite/storage-lock.ts";
import {
  createWebMcpBridge,
  getWebMcpAppToolMode,
  setWebMcpAppToolMode,
  webmcpSupported,
  type WebMcpAppToolMode,
} from "$lib/runtime/webmcp.ts";

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
  readonly stores: HostSnapshot["stores"];
  readonly catalog: HostSnapshot["catalog"];
}

class SessionState {
  ready = $state(false);
  host = $state.raw<Host | null>(null);
  framework = $state.raw<OpenedRuntime | null>(null);
  diagnostics = $state.raw<RuntimeDiagnostics | null>(null);
  app = $state.raw<AppSummary | null>(null);
  apps = $state.raw<readonly AppSummary[]>([]);
  space = $state.raw<SpaceSummary | null>(null);
  spaces = $state.raw<readonly SpaceSummary[]>([]);
  resolvedSpec = $state.raw<AppSpec | undefined>(undefined);
  authoredSpec = $state.raw<AppSpec | undefined>(undefined);
  sharedTypes = $state.raw<readonly TypeDef[]>([]);
  actor = $state.raw<Actor | null>(null);
  actors = $state.raw<readonly Actor[]>([]);
  accent = $state<SpaceAccent>("blue");
  error = $state<string | null>(null);
  revision = $state(0);
  webmcp = $state(false);
  webmcpToolMode = $state<WebMcpAppToolMode>("compact");
}

export const session = new SessionState();

type LiveRuntime = {
  host: Host;
  framework: OpenedRuntime;
  unsub: () => void;
  stopMcp: () => void;
};

const hot = import.meta.hot;
let live: LiveRuntime | null = hot?.data.live ?? null;
let booting: Promise<void> | null = hot?.data.booting ?? null;

hot?.dispose(() => {
  hot.data.live = live;
  hot.data.booting = booting;
});

function publish(runtime: LiveRuntime) {
  runtime.unsub?.();
  runtime.unsub = runtime.host.subscribe(() => {
    publishSnapshot(runtime.host.snapshot());
    session.revision += 1;
  });
  session.host = runtime.host;
  session.framework = runtime.framework;
  publishSnapshot(runtime.host.snapshot());
  session.webmcp = webmcpSupported();
  session.webmcpToolMode = getWebMcpAppToolMode();
  session.ready = true;
  session.error = null;
  clearStorageLockReload();
  void publishFrameworkPreferences(runtime).catch((error: unknown) => {
    session.error = error instanceof Error ? error.message : "Unable to load profile settings.";
  });
}

async function publishFrameworkPreferences(runtime: LiveRuntime): Promise<void> {
  const framework = runtime.framework;
  const actor = await framework.spaceClient.getActor(framework.actorId);
  if (runtime !== live || runtime.framework !== framework || !actor) return;
  session.actor = {
    id: actor.id,
    kind: actor.kind,
    name: actor.name,
    ...(actor.email ? { email: actor.email } : {}),
    roles: session.actor?.roles ?? ["owner"],
  };
  session.space = {
    id: session.space?.id ?? runtime.framework.space.id,
    name: runtime.framework.space.name,
  };
  const accent = runtime.framework.space.spec.meta?.appearance;
  session.accent = "blue";
  if (accent && typeof accent === "object" && !Array.isArray(accent) && "accent" in accent) {
    const value = accent.accent;
    if (SPACE_ACCENT_KEYS.includes(value as SpaceAccent)) session.accent = value as SpaceAccent;
  }
}

async function alignFrameworkApp(runtime: LiveRuntime): Promise<void> {
  const snapshot = runtime.host.snapshot();
  const aligned = await resolveProjectedApp(
    runtime.framework.kernel,
    runtime.framework.spaceContext,
    {
      name: snapshot.app.name,
      spec: snapshot.app.spec,
      sharedTypes: snapshot.sharedTypes,
    },
  );
  runtime.framework = { ...runtime.framework, ...aligned };
  session.framework = runtime.framework;
  await publishFrameworkPreferences(runtime);
}

async function reopenFramework(runtime: LiveRuntime): Promise<void> {
  const snapshot = runtime.host.snapshot();
  await runtime.framework.kernel.close();
  runtime.framework = await openRuntime({
    kernel: {
      environment: { ...LOCAL_BROWSER_ENVIRONMENT, durableRuleExecution: true },
      persistence: createKernelSqlitePersistence(await openSqlGateway()),
    },
    seed: {
      spaceName: snapshot.space.name,
      appName: snapshot.app.name,
      user: { name: snapshot.actor.name, email: snapshot.actor.email },
      spaceSpec: snapshot.space.spec,
      appSpec: snapshot.app.spec,
      sharedTypes: snapshot.sharedTypes,
    },
  });
  session.framework = runtime.framework;
  await publishFrameworkPreferences(runtime);
}

function publishSnapshot(snapshot: HostSnapshot) {
  session.diagnostics = {
    backend: snapshot.backend,
    engine: snapshot.engine,
    stores: snapshot.stores,
    catalog: snapshot.catalog,
  };
  session.app = { id: snapshot.app.id, name: snapshot.app.name };
  session.apps = snapshot.apps;
  session.space = {
    id: snapshot.space.id,
    name: session.framework?.space.name ?? snapshot.space.name,
  };
  session.spaces = snapshot.spaces;
  session.resolvedSpec = snapshot.spec;
  session.authoredSpec = snapshot.app.spec;
  session.sharedTypes = snapshot.sharedTypes;
  if (!session.framework) session.actor = snapshot.actor;
  session.actors = snapshot.space.actors;
  if (!session.framework) session.accent = snapshot.space.appearance?.accent ?? "blue";
}

function adoptLive(runtime: LiveRuntime) {
  runtime.stopMcp?.();
  const mcp = createWebMcpBridge(runtime.host);
  runtime.stopMcp = () => mcp.stop();
  publish(runtime);
}

if (live) adoptLive(live);

export function boot(): Promise<void> {
  if (live) {
    publish(live);
    return booting ?? Promise.resolve();
  }
  booting ??= (async () => {
    try {
      const host = await Host.open();
      const snapshot = host.snapshot();
      let framework = await openRuntime({
        kernel: {
          environment: { ...LOCAL_BROWSER_ENVIRONMENT, durableRuleExecution: true },
          persistence: createKernelSqlitePersistence(await openSqlGateway()),
        },
        seed: {
          spaceName: snapshot.space.name,
          appName: snapshot.app.name,
          user: { name: snapshot.actor.name, email: snapshot.actor.email },
          spaceSpec: snapshot.space.spec,
          appSpec: snapshot.app.spec,
          sharedTypes: snapshot.sharedTypes,
        },
      });
      const mcp = createWebMcpBridge(host);
      live = {
        host,
        framework,
        unsub: () => {},
        stopMcp: () => mcp.stop(),
      };
      await alignFrameworkApp(live);
      publish(live);
    } catch (error) {
      if (isStorageLocked(error) && takeStorageLockReload()) {
        location.reload();
        return;
      }
      session.error = isStorageLocked(error)
        ? "Another tab may still be using this space. Close extra tabs, then reload."
        : "Something went wrong while opening your space. Reload to try again.";
    }
  })();
  return booting;
}

export function runtime(): Host {
  if (!session.host) throw new Error("builder.run runtime is not ready");
  return session.host;
}

export async function updateProfile(input: { name: string; email?: string }): Promise<void> {
  if (!live) throw new Error("The Framework runtime is not ready.");
  const actor = await live.framework.spaceClient.updateActor(live.framework.actorId, input);
  session.actor = {
    id: actor.id,
    kind: actor.kind,
    name: actor.name,
    ...(actor.email ? { email: actor.email } : {}),
    roles: session.actor?.roles ?? ["owner"],
  };
}

export async function updateSpaceSettings(name: string, accent: SpaceAccent): Promise<void> {
  if (!live) throw new Error("The Framework runtime is not ready.");
  const renamed = await live.framework.kernel.renameWorkspace(live.framework.spaceContext, {
    name,
  });
  const current = await live.framework.spaceClient.getWorkspace();
  const appearance = current.spec.meta?.appearance;
  const updated = await live.framework.spaceClient.applySpec({
    ...current.spec,
    meta: {
      ...current.spec.meta,
      appearance: {
        ...(appearance && typeof appearance === "object" && !Array.isArray(appearance)
          ? appearance
          : {}),
        accent,
      },
    },
  });
  live.framework = { ...live.framework, space: { ...renamed, spec: updated.spec } };
  session.framework = live.framework;
  session.space = { id: session.space?.id ?? renamed.id, name: renamed.name };
  session.accent = accent;
}

/** App-shell commands stay behind this boundary while their implementation moves to the Framework. */
export async function selectApp(id: string): Promise<void> {
  await runtime().switchApp(id);
  if (live) await alignFrameworkApp(live);
}

export async function createApp(name: string, template?: string | null): Promise<void> {
  await runtime().createApp(name, template);
  if (live) {
    await alignFrameworkApp(live);
    const sample = sampleApps.find((item) => item.key === template);
    if (sample) await seedTemplateRecords(live.framework, sample);
  }
}

export async function renameApp(name: string): Promise<void> {
  await runtime().renameApp(name);
  if (!live) return;
  await alignFrameworkApp(live);
  const aligned = await renameFrameworkApp(live.framework.kernel, live.framework, name);
  live.framework = { ...live.framework, ...aligned };
  session.framework = live.framework;
}

export async function deleteApp(id: string): Promise<void> {
  if (live && live.host.app().id === id) {
    await alignFrameworkApp(live);
    const fallback = await deleteFrameworkApp(
      live.framework.kernel,
      live.framework.spaceContext,
      live.framework.app.id,
    );
    live.framework = { ...live.framework, ...fallback };
  }
  await runtime().deleteApp(id);
  if (live) await alignFrameworkApp(live);
}

export async function selectSpace(id: string): Promise<void> {
  await runtime().switchSpace(id);
  if (live) await reopenFramework(live);
}

export async function createSpace(name: string): Promise<void> {
  await runtime().createSpace(name);
  if (live) await reopenFramework(live);
}

export function configureWebMcpAppToolMode(mode: WebMcpAppToolMode): void {
  setWebMcpAppToolMode(mode);
  session.webmcpToolMode = mode;
  session.revision += 1;
}

/** Dev tool: drop all local SQLite/OPFS/IndexedDB data and reload. */
export async function wipeAllLocalData(): Promise<void> {
  await session.framework?.kernel.close();
  session.framework = null;
  session.diagnostics = null;
  session.app = null;
  session.apps = [];
  session.space = null;
  session.spaces = [];
  session.resolvedSpec = undefined;
  session.authoredSpec = undefined;
  session.sharedTypes = [];
  session.actor = null;
  session.actors = [];
  session.accent = "blue";
  if (session.host) {
    await session.host.resetLocalData();
  } else {
    const { wipeLocalData } = await import("$lib/runtime/persistence/sqlite/browser-storage.ts");
    await wipeLocalData();
  }
  location.reload();
}

export const chrome: {
  newAppOpen: boolean;
  newAppPreset: string;
} = $state({
  newAppOpen: false,
  newAppPreset: "",
});

export function openNewApp(preset = "") {
  chrome.newAppPreset = preset;
  chrome.newAppOpen = true;
}
