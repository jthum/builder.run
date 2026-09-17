import {
  Kernel,
  type ExecutionContext,
  type KernelOptions,
  type Workspace,
} from "@jthum/framework/kernel";
import type { Spec } from "@jthum/framework/spec";
import { createWorkspaceClient, type WorkspaceClient } from "@jthum/framework/client";
import type { AppSpec, TypeDef } from "$lib/runtime/model.ts";
import { projectFrameworkSpec, type FrameworkProjectionGap } from "./projection.ts";

export interface RuntimeSeed {
  readonly spaceName: string;
  readonly appName: string;
  readonly user: { readonly name: string; readonly email?: string };
  readonly spaceSpec: AppSpec;
  readonly appSpec: AppSpec;
  /** Shared Type definitions installed in the Space and bound into the App. */
  readonly sharedTypes: readonly TypeDef[];
}

export interface AppSeed {
  readonly name: string;
  readonly spec: AppSpec;
  /** Existing Space Types this App consumes through Attachments. */
  readonly sharedTypes: readonly TypeDef[];
}

export interface AppSelection {
  readonly spaceId: string;
  readonly appId: string;
}

export interface CreateRuntimeInput extends RuntimeSeed {
  readonly kernel: KernelOptions;
}

export interface OpenRuntimeInput {
  readonly kernel: KernelOptions;
  readonly seed: RuntimeSeed;
  /** Optional local UI preferences; the persisted catalog remains authoritative. */
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

export interface CreatedRuntime extends AppRuntime {
  /** Deliberate capabilities waiting on later framework phases. */
  readonly gaps: readonly FrameworkProjectionGap[];
}

export type OpenedRuntime =
  | (CreatedRuntime & { readonly isNew: true })
  | (AppRuntime & { readonly isNew: false });

/**
 * Creates the Space/App topology on the Framework Kernel.
 *
 * This seeds the canonical Framework database and never reads the old Host database.
 */
export async function createRuntime(input: CreateRuntimeInput): Promise<CreatedRuntime> {
  const spaceProjection = projectFrameworkSpec(input.spaceSpec, { sharedTypes: [] });
  const appProjection = projectFrameworkSpec(input.appSpec, {
    sharedTypes: input.sharedTypes,
  });
  assertSharedTypesProjected(input.sharedTypes, spaceProjection.spec, appProjection.spec);
  const kernel = await Kernel.open(input.kernel);
  try {
    const root = await kernel.createRootWorkspace({
      name: input.spaceName,
      user: input.user,
    });
    const spaceContext = {
      workspaceId: root.workspace.id,
      actorId: root.user.id,
    };
    await kernel.applySpec(spaceContext, spaceProjection.spec);
    const space = await kernel.updateWorkspaceAccess(spaceContext, {
      members: ["read", "create", "update", "delete", "manage"],
      others: ["read"],
    });
    const appRuntime = await createProjectedApp(
      kernel,
      spaceContext,
      space,
      input.appName,
      input.sharedTypes,
      appProjection.spec,
    );
    return {
      kernel,
      ...appRuntime,
      gaps: [...spaceProjection.gaps, ...appProjection.gaps],
    };
  } catch (error) {
    await kernel.close();
    throw error;
  }
}

/** Creates one App as a child Workspace with explicit shared-Type Attachments. */
export async function createApp(
  kernel: Kernel,
  spaceContext: ExecutionContext,
  input: AppSeed,
): Promise<AppContext> {
  const space = await kernel.getWorkspace(spaceContext);
  if (!space?.isRoot) throw new Error("Apps must be created inside a Space.");
  const projection = projectFrameworkSpec(input.spec, { sharedTypes: input.sharedTypes });
  assertSharedTypesProjected(input.sharedTypes, space.spec, projection.spec);
  return createProjectedApp(
    kernel,
    spaceContext,
    space,
    input.name,
    input.sharedTypes,
    projection.spec,
  );
}

/** Lists the child Workspaces the current Actor can select as Apps. */
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

/** Resolves the Space/App convention for an Actor on an already-open Kernel. */
export async function resolveApp(
  kernel: Kernel,
  selection: AppSelection,
  actorId: string,
): Promise<AppContext> {
  const { spaceId, appId } = selection;
  const spaceContext = await kernel.resolveContext({ workspaceId: spaceId, actorId });
  const appContext = await kernel.resolveContext({ workspaceId: appId, actorId });
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

/** Opens the local topology, creating it only when the catalog is empty. */
export async function openRuntime(input: OpenRuntimeInput): Promise<OpenedRuntime> {
  const startup = await findStartup(input.kernel, input.preferredSelection, input.preferredActorId);
  if (startup) {
    const kernel = await Kernel.open(input.kernel);
    try {
      return {
        kernel,
        ...(await resolveApp(kernel, startup.selection, startup.actorId)),
        isNew: false,
      };
    } catch (error) {
      await kernel.close();
      throw error;
    }
  }
  const created = await createRuntime({ ...input.seed, kernel: input.kernel });
  return { ...created, isNew: true };
}

async function findStartup(
  options: KernelOptions,
  preferredSelection: Partial<AppSelection> | undefined,
  preferredActorId: string | undefined,
): Promise<{ readonly selection: AppSelection; readonly actorId: string } | null> {
  const persistence = await options.persistence.open();
  try {
    const roots = await persistence.catalog.listRootWorkspaces();
    if (!roots.length) return null;
    const space =
      roots.find((workspace) => workspace.id === preferredSelection?.spaceId) ?? roots.at(0)!;
    const users = (await persistence.catalog.listActorsByOrigin(space.id)).filter(
      (actor) => actor.kind === "user",
    );
    const actor = users.find((candidate) => candidate.id === preferredActorId) ?? users.at(0);
    if (!actor) throw new Error(`Space ${space.id} has no locally issued user.`);
    const memberOf = new Set(
      (await persistence.catalog.listMembershipsForActor(actor.id)).map(
        (membership) => membership.workspaceId,
      ),
    );
    const apps = (await persistence.catalog.listChildWorkspaces(space.id)).filter((workspace) =>
      memberOf.has(workspace.id),
    );
    const app = apps.find((workspace) => workspace.id === preferredSelection?.appId) ?? apps.at(0);
    if (!app) throw new Error(`Space ${space.id} has no accessible App.`);
    return {
      selection: { spaceId: space.id, appId: app.id },
      actorId: actor.id,
    };
  } finally {
    await persistence.close();
  }
}

function assertSharedTypesProjected(sharedTypes: readonly TypeDef[], space: Spec, app: Spec): void {
  const collections = new Set(space.collections.map((collection) => collection.id));
  const sources = new Set(app.sources.map((source) => source.id));
  for (const type of sharedTypes) {
    if (!collections.has(type.id) || !sources.has(type.id)) {
      throw new Error(`Shared Type ${type.key} must project from the Space into the App.`);
    }
  }
}

async function createProjectedApp(
  kernel: Kernel,
  spaceContext: ExecutionContext,
  space: Workspace,
  name: string,
  sharedTypes: readonly TypeDef[],
  spec: Spec,
): Promise<AppContext> {
  const child = await kernel.createWorkspace(spaceContext, { name });
  const appContext = { ...spaceContext, workspaceId: child.workspace.id };
  const app = await kernel.applySpec(appContext, spec);
  for (const type of sharedTypes) {
    await kernel.createAttachment(spaceContext, {
      collectionKey: type.key,
      targetId: app.id,
      sourceId: type.id,
    });
  }
  return {
    spaceClient: await createWorkspaceClient(kernel, spaceContext),
    appClient: await createWorkspaceClient(kernel, appContext),
    space,
    app,
    spaceContext,
    appContext,
    selection: { spaceId: space.id, appId: app.id },
    actorId: spaceContext.actorId,
  };
}
