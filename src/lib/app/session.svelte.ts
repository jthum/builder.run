import { Host, type HostSnapshot } from "$lib/runtime/host.ts";
import {
  clearStorageLockReload,
  isStorageLocked,
  takeStorageLockReload,
} from "$lib/runtime/storage-lock.ts";
import { createWebMcpBridge, webmcpSupported } from "$lib/runtime/webmcp.ts";

export const session: {
  ready: boolean;
  host: Host | null;
  snapshot: HostSnapshot | null;
  error: string | null;
  revision: number;
  webmcp: boolean;
} = $state({
  ready: false,
  host: null,
  snapshot: null,
  error: null,
  revision: 0,
  webmcp: false,
});

type LiveRuntime = {
  host: Host;
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
  session.snapshot = runtime.host.snapshot();
  session.webmcp = webmcpSupported();
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
      const mcp = createWebMcpBridge(host);
      live = {
        host,
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

/** Dev tool: drop all local SQLite/OPFS/IndexedDB data and reload. */
export async function wipeAllLocalData(): Promise<void> {
  if (session.host) {
    await session.host.resetLocalData();
  } else {
    const { wipeLocalData } = await import("$lib/runtime/persist.ts");
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
