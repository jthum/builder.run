import { Host, type HostSnapshot } from "$lib/runtime/host.ts";
import type { Actor, AppSpec, TypeDef } from "$lib/runtime/model.ts";
import type { SpaceAccent } from "$lib/runtime/platform.ts";
import { openRuntime, type OpenedRuntime } from "$lib/framework/bootstrap.ts";
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
  session.space = { id: snapshot.space.id, name: snapshot.space.name };
  session.spaces = snapshot.spaces;
  session.resolvedSpec = snapshot.spec;
  session.authoredSpec = snapshot.app.spec;
  session.sharedTypes = snapshot.sharedTypes;
  session.actor = snapshot.actor;
  session.actors = snapshot.space.actors;
  session.accent = snapshot.space.appearance?.accent ?? "blue";
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
      const framework = await openRuntime({
        kernel: {
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

/** App-shell commands stay behind this boundary while their implementation moves to the Framework. */
export async function selectApp(id: string): Promise<void> {
  await runtime().switchApp(id);
}

export async function createApp(name: string, template?: string | null): Promise<void> {
  await runtime().createApp(name, template);
}

export async function renameApp(name: string): Promise<void> {
  await runtime().renameApp(name);
}

export async function deleteApp(id: string): Promise<void> {
  await runtime().deleteApp(id);
}

export async function selectSpace(id: string): Promise<void> {
  await runtime().switchSpace(id);
}

export async function createSpace(name: string): Promise<void> {
  await runtime().createSpace(name);
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
