import { SERVER_MODE } from "$lib/app/deployment.ts";
import { building } from "$app/env";

/** Fail startup on invalid credentials/storage, but never open instance data during a build. */
export async function init(): Promise<void> {
  if (SERVER_MODE && !building) {
    const { server } = await import("$lib/server/index.ts");
    await server();
  }
}

// adapter-node emits this after draining requests; all SQLite handles close before releasing the lease.
if (SERVER_MODE) {
  process.once("sveltekit:shutdown", async () => {
    const { closeServer } = await import("$lib/server/index.ts");
    await closeServer();
  });
}
