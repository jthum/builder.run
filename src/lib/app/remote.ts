import { createHttpWorkspaceClient, readJsonResponse } from "@jthum/framework-http";
import type { AppContext, AppSelection } from "$lib/framework/bootstrap.ts";
import { decodeRuntimeInfo } from "$lib/framework/runtime-info.ts";
import type { RemoteSnapshot } from "./remote-contract.ts";

export async function serverRequest(
  command: string,
  input: Record<string, unknown> = {},
  selection?: Partial<AppSelection>,
): Promise<unknown> {
  const response = await fetch("/api/app", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ command, input, ...(selection ? { selection } : {}) }),
  });
  const body = (await readJsonResponse(response)) as { result: unknown };
  return body.result;
}

export async function loadRemoteSnapshot(
  selection?: Partial<AppSelection>,
  command = "snapshot",
  input: Record<string, unknown> = {},
): Promise<RemoteSnapshot> {
  return (await serverRequest(command, input, selection)) as RemoteSnapshot;
}

export function remoteContext(snapshot: RemoteSnapshot): AppContext {
  const query = new URLSearchParams({ spaceId: snapshot.space.id, appId: snapshot.app.id });
  const client = (id: string) =>
    createHttpWorkspaceClient({ url: `/api/workspaces/${encodeURIComponent(id)}?${query}` });
  return {
    space: snapshot.space,
    app: snapshot.app,
    actorId: snapshot.actorId,
    selection: snapshot.selection,
    profiles: decodeRuntimeInfo(snapshot.profiles),
    spaceContext: { workspaceId: snapshot.space.id, actorId: snapshot.actorId },
    appContext: { workspaceId: snapshot.app.id, actorId: snapshot.actorId },
    spaceClient: client(snapshot.space.id),
    appClient: client(snapshot.app.id),
  };
}
