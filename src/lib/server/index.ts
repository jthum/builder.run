import { ServerRuntime } from "./runtime.ts";
import { createServerHandler } from "./http.ts";
import { DATA_DIR, ORIGIN } from "$app/env/private";

type ServerHandle = {
  runtime: ServerRuntime;
  handle: ReturnType<typeof createServerHandler>;
};
// A linked-package/HMR reload must not open a second owner of the same data directory.
const processState = globalThis as typeof globalThis & { appServer?: Promise<ServerHandle> | null };

export function server() {
  processState.appServer ??= ServerRuntime.open({
    directory: DATA_DIR,
  })
    .then((runtime) => ({
      runtime,
      handle: createServerHandler(runtime, ORIGIN ? { origin: ORIGIN } : {}),
    }))
    .catch((error: unknown) => {
      processState.appServer = null;
      throw error;
    });
  return processState.appServer;
}

export async function closeServer(): Promise<void> {
  const current = processState.appServer;
  processState.appServer = null;
  if (current) await (await current).runtime.close();
}
