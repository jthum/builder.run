import { Host, type HostSnapshot } from "$lib/runtime/host.ts";
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

let booting: Promise<void> | null = null;

export function boot(): Promise<void> {
  booting ??= (async () => {
    try {
      const host = await Host.open();
      session.host = host;
      session.snapshot = host.snapshot();
      session.webmcp = webmcpSupported();
      host.subscribe(() => {
        session.snapshot = host.snapshot();
        session.revision += 1;
      });
      createWebMcpBridge(host);
      session.ready = true;
    } catch (error) {
      session.error = error instanceof Error ? error.message : String(error);
    }
  })();
  return booting;
}

export function runtime(): Host {
  if (!session.host) throw new Error("builder.run runtime is not ready");
  return session.host;
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
