import { createHttpWorkspaceClient } from "@jthum/framework-http";
import { loadEditorContext } from "@jthum/framework/svelte/authoring/data";
import { getIdentity } from "@spacefast/zero/client";
import { WorkspaceData } from "$lib/app/workspace-data.svelte.ts";
import { writeMethods } from "../deployment/methods.ts";

const client = createHttpWorkspaceClient({
  url: "/api/app/read",
  headers: (): HeadersInit => {
    const token = getIdentity().token;
    return token ? { authorization: `Bearer ${token}` } : {};
  },
  fetch: (url, init) => {
    const { method } = JSON.parse(init?.body as string);
    return fetch(writeMethods.has(method) ? "/api/app/write" : url, init);
  },
});

class PublishedData extends WorkspaceData {
  protected runtime() {
    return { appClient: client, spaceClient: client };
  }
  async connect() {
    // The write invocation binds a verified native identity and installs a deployed revision.
    const token = getIdentity().token;
    const response = await fetch("/api/app/write", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ method: "getWorkspace", args: [] }),
    });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error?.message ?? `Unable to open app (${response.status}).`);
    }
    const loaded = await loadEditorContext(client);
    this.context = loaded.context;
    this.spec = loaded.spec;
    this.schemas = loaded.schemas;
    this.revision++;
  }
}
export const canonicalStudio = new PublishedData();
export const session = { accent: "blue" as const };
