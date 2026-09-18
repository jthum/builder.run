import {
  Kernel,
  type ExecutionContext,
  type KernelOptions,
  type Workspace,
} from "@jthum/framework/kernel";
import { createEmptySpec, type Spec } from "@jthum/framework/spec";
import { createWorkspaceClient, type WorkspaceClient } from "@jthum/framework/client";
import { nanoid } from "nanoid";

export interface RuntimeSeed {
  readonly spaceName: string;
  readonly appName: string;
  readonly user: { readonly name: string; readonly email?: string };
  readonly spaceSpec: Spec;
  readonly appSpec: Spec;
}
export interface AppSeed {
  readonly name: string;
  readonly spec: Spec;
}
export interface AppSelection {
  readonly spaceId: string;
  readonly appId: string;
}
export interface OpenRuntimeInput {
  readonly kernel: KernelOptions;
  readonly seed: RuntimeSeed;
  readonly preferredSelection?: Partial<AppSelection>;
  readonly preferredActorId?: string;
}
export interface AppContext {
  readonly spaceClient: WorkspaceClient;
  readonly appClient: WorkspaceClient;
  readonly space: Workspace;
  readonly app: Workspace;
  readonly spaceContext: ExecutionContext;
  readonly appContext: ExecutionContext;
  readonly selection: AppSelection;
  readonly actorId: string;
}
export interface AppRuntime extends AppContext {
  readonly kernel: Kernel;
}
export type OpenedRuntime = AppRuntime & {
  readonly isNew: boolean;
  /** Trusted browser-local issuance discovery, not server authentication. */
  readonly localActors: Readonly<Record<string, string>>;
};

export function emptySpec(key: string, label: string): Spec {
  return createEmptySpec({ id: nanoid(), key, label });
}

/** Local host bootstrap; server hosts choose Actor identity from authenticated credentials. */
export async function createRuntime(
  input: RuntimeSeed & { readonly kernel: KernelOptions },
): Promise<AppRuntime> {
  const kernel = await Kernel.open(input.kernel);
  try {
    const context = await createSpace(kernel, input);
    return { kernel, ...context };
  } catch (error) {
    await kernel.close();
    throw error;
  }
}

export async function createSpace(kernel: Kernel, input: RuntimeSeed): Promise<AppContext> {
  const root = await kernel.createRootWorkspace({ name: input.spaceName, user: input.user });
  const spaceContext = { workspaceId: root.workspace.id, actorId: root.user.id };
  await kernel.applySpec(spaceContext, input.spaceSpec);
  await kernel.updateWorkspaceAccess(spaceContext, {
    members: ["read", "create", "update", "delete", "manage"],
    others: ["read"],
  });
  return createApp(kernel, spaceContext, { name: input.appName, spec: input.appSpec });
}

export async function createApp(
  kernel: Kernel,
  spaceContext: ExecutionContext,
  input: AppSeed,
): Promise<AppContext> {
  const space = await kernel.getWorkspace(spaceContext);
  if (!space?.isRoot) throw new Error("Apps must be created inside a Space.");
  const collections = new Map(
    space.spec.collections.map((collection) => [collection.key, collection]),
  );
  for (const source of input.spec.sources) {
    if (!collections.has(source.key))
      throw new Error(`Shared Collection ${source.key} is unavailable.`);
  }
  const child = await kernel.createWorkspace(spaceContext, { name: input.name });
  const appContext = { ...spaceContext, workspaceId: child.workspace.id };
  try {
    await kernel.applySpec(appContext, input.spec);
    for (const source of input.spec.sources) {
      await kernel.createAttachment(spaceContext, {
        collectionKey: source.key,
        targetId: child.workspace.id,
        sourceId: source.id,
      });
    }
    return resolveApp(
      kernel,
      { spaceId: space.id, appId: child.workspace.id },
      spaceContext.actorId,
    );
  } catch (error) {
    try {
      await kernel.deleteWorkspace(appContext);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "App creation and cleanup failed.");
    }
    throw error;
  }
}

export async function listApps(
  kernel: Kernel,
  spaceContext: ExecutionContext,
): Promise<readonly Workspace[]> {
  const space = await kernel.getWorkspace(spaceContext);
  if (!space?.isRoot) throw new Error("Apps must be listed from a Space.");
  const [children, memberships] = await Promise.all([
    kernel.listChildWorkspaces(spaceContext, space.id),
    kernel.listMembershipsForActor(spaceContext, spaceContext.actorId),
  ]);
  const memberOf = new Set(memberships.map((membership) => membership.workspaceId));
  return children.filter((workspace) => memberOf.has(workspace.id));
}

export async function renameApp(
  kernel: Kernel,
  context: AppContext,
  name: string,
): Promise<AppContext> {
  await kernel.renameWorkspace(context.appContext, { name });
  return resolveApp(kernel, context.selection, context.actorId);
}

export async function deleteApp(
  kernel: Kernel,
  spaceContext: ExecutionContext,
  appId: string,
): Promise<AppContext> {
  const apps = await listApps(kernel, spaceContext);
  if (apps.length <= 1) throw new Error("A Space must retain at least one App.");
  const target = apps.find((app) => app.id === appId);
  if (!target) throw new Error(`App ${appId} is unavailable in this Space.`);
  const selected = await resolveApp(
    kernel,
    { spaceId: spaceContext.workspaceId, appId },
    spaceContext.actorId,
  );
  await kernel.deleteWorkspace(selected.appContext);
  const fallback = apps.find((app) => app.id !== target.id)!;
  return resolveApp(
    kernel,
    { spaceId: spaceContext.workspaceId, appId: fallback.id },
    spaceContext.actorId,
  );
}

export async function resolveApp(
  kernel: Kernel,
  selection: AppSelection,
  actorId: string,
): Promise<AppContext> {
  const spaceContext = await kernel.resolveContext({ workspaceId: selection.spaceId, actorId });
  const appContext = await kernel.resolveContext({ workspaceId: selection.appId, actorId });
  const [space, app, actor] = await Promise.all([
    kernel.getWorkspace(spaceContext),
    kernel.getWorkspace(appContext),
    kernel.getActor(spaceContext, actorId),
  ]);
  if (
    !space?.isRoot ||
    !app ||
    app.isRoot ||
    app.parentId !== space.id ||
    !actor ||
    actor.rootId !== space.id
  ) {
    throw new Error("Selection does not resolve to one Space and App for this Actor.");
  }
  return {
    spaceClient: await createWorkspaceClient(kernel, spaceContext),
    appClient: await createWorkspaceClient(kernel, appContext),
    space,
    app,
    spaceContext,
    appContext,
    selection: { spaceId: space.id, appId: app.id },
    actorId: actor.id,
  };
}

/** Browser-only local Actor discovery, never a server authentication mechanism. */
export async function resolveSpace(
  kernel: Kernel,
  spaceId: string,
  actorId: string,
): Promise<AppContext> {
  const context = await kernel.resolveContext({ workspaceId: spaceId, actorId });
  const app = (await listApps(kernel, context)).at(0);
  if (!app) throw new Error("Space has no selectable App.");
  return resolveApp(kernel, { spaceId, appId: app.id }, actorId);
}

export async function openRuntime(input: OpenRuntimeInput): Promise<OpenedRuntime> {
  // Trusted local discovery precedes Kernel opening; it does not grant permissions.
  const persistence = await input.kernel.persistence.open();
  let startup: { selection: AppSelection; actorId: string } | undefined;
  let empty = false;
  const localActors: Record<string, string> = {};
  try {
    const roots = await persistence.catalog.listRootWorkspaces();
    empty = !roots.length;
    for (const root of roots) {
      const user = (await persistence.catalog.listActorsByOrigin(root.id)).find(
        (actor) => actor.kind === "user",
      );
      if (user) localActors[root.id] = user.id;
    }
    const space =
      roots.find((root) => root.id === input.preferredSelection?.spaceId) ?? roots.at(0);
    if (space) {
      const users = (await persistence.catalog.listActorsByOrigin(space.id)).filter(
        (actor) => actor.kind === "user",
      );
      const actor = users.find((user) => user.id === input.preferredActorId) ?? users.at(0);
      if (!actor) throw new Error("Space has no locally issued User.");
      const memberships = await persistence.catalog.listMembershipsForActor(actor.id);
      const memberOf = new Set(memberships.map((membership) => membership.workspaceId));
      const apps = (await persistence.catalog.listChildWorkspaces(space.id)).filter((app) =>
        memberOf.has(app.id),
      );
      const app = apps.find((app) => app.id === input.preferredSelection?.appId) ?? apps.at(0);
      if (!app) throw new Error("Space has no selectable App.");
      startup = { selection: { spaceId: space.id, appId: app.id }, actorId: actor.id };
    }
  } finally {
    await persistence.close();
  }
  if (empty) {
    const created = await createRuntime({ ...input.seed, kernel: input.kernel });
    return { ...created, isNew: true, localActors: { [created.space.id]: created.actorId } };
  }
  if (!startup) throw new Error("No locally accessible Space.");
  const kernel = await Kernel.open(input.kernel);
  try {
    return {
      kernel,
      ...(await resolveApp(kernel, startup.selection, startup.actorId)),
      isNew: false,
      localActors,
    };
  } catch (error) {
    await kernel.close();
    throw error;
  }
}
