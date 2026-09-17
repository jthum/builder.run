import { Host, type HostSnapshot } from "$lib/runtime/host.ts";
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

class SessionState {
  ready = $state(false);
  host = $state.raw<Host | null>(null);
  framework = $state.raw<OpenedRuntime | null>(null);
  snapshot = $state.raw<HostSnapshot | null>(null);
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
    session.snapshot = runtime.host.snapshot();
    session.revision += 1;
  });
  session.host = runtime.host;
  session.framework = runtime.framework;
  session.snapshot = runtime.host.snapshot();
  session.webmcp = webmcpSupported();
  session.webmcpToolMode = getWebMcpAppToolMode();
  session.ready = true;
  session.error = null;
  clearStorageLockReload();
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
