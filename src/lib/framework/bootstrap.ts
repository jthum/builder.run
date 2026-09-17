import {
  Kernel,
  type ExecutionContext,
  type KernelOptions,
  type Workspace,
} from "@jthum/framework/kernel";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import type { AppSpec, TypeDef } from "$lib/runtime/model.ts";
import { projectFrameworkSpec, type FrameworkProjectionGap } from "./projection.ts";

export interface BuilderKernelBootstrapInput {
  readonly spaceName: string;
  readonly appName: string;
  readonly user: { readonly name: string; readonly email?: string };
  readonly spaceSpec: AppSpec;
  readonly appSpec: AppSpec;
  /** Shared Type definitions installed in the Space and bound into the App. */
  readonly sharedTypes: readonly TypeDef[];
  readonly kernel?: Omit<KernelOptions, "persistence"> & {
    readonly persistence?: KernelOptions["persistence"];
  };
}

export interface BuilderKernelIdentity {
  readonly spaceId: string;
  readonly appId: string;
  readonly actorId: string;
}

export interface OpenBuilderKernelInput {
  readonly identity: BuilderKernelIdentity;
  readonly kernel: KernelOptions;
}

export interface StartBuilderKernelInput {
  readonly kernel: KernelOptions;
  readonly seed: Omit<BuilderKernelBootstrapInput, "kernel">;
  /** Optional local UI preference; catalog identity remains authoritative. */
  readonly preferred?: Partial<BuilderKernelIdentity>;
}

export interface BuilderKernelInstance {
  readonly kernel: Kernel;
  readonly space: Workspace;
  readonly app: Workspace;
  readonly spaceContext: ExecutionContext;
  readonly appContext: ExecutionContext;
  readonly identity: BuilderKernelIdentity;
}

export interface BuilderKernelBootstrap extends BuilderKernelInstance {
  /** Deliberate capabilities waiting on later framework phases. */
  readonly gaps: readonly FrameworkProjectionGap[];
}

export interface BuilderKernelStart extends BuilderKernelInstance {
  readonly created: boolean;
  readonly gaps: readonly FrameworkProjectionGap[];
}

/**
 * Boots the Builder Space/App topology on the Framework Kernel.
 *
 * This is the executable Phase 4 seam, not an importer for the legacy Builder database. A
 * persistence/migration adapter can preserve existing records separately when the UI switches.
 */
export async function bootstrapBuilderKernel(
  input: BuilderKernelBootstrapInput,
): Promise<BuilderKernelBootstrap> {
  const kernel = await Kernel.open({
    ...input.kernel,
    persistence: input.kernel?.persistence ?? new MemoryPersistenceAdapter(),
  });
  try {
    const bootstrap = await kernel.createRootWorkspace({
      name: input.spaceName,
      user: input.user,
    });
    const spaceContext = {
      workspaceId: bootstrap.workspace.id,
      actorId: bootstrap.user.id,
    };
    const created = await kernel.createWorkspace(spaceContext, { name: input.appName });
    const appContext = { ...spaceContext, workspaceId: created.workspace.id };
    const spaceProjection = projectFrameworkSpec(input.spaceSpec, { sharedTypes: [] });
    const appProjection = projectFrameworkSpec(input.appSpec, {
      sharedTypes: input.sharedTypes,
    });
    const space = await kernel.applySpec(spaceContext, spaceProjection.spec);
    const app = await kernel.applySpec(appContext, appProjection.spec);
    for (const type of input.sharedTypes) {
      await kernel.createAttachment(spaceContext, {
        collectionKey: type.key,
        targetId: app.id,
        sourceId: type.id,
      });
    }
    return {
      kernel,
      space,
      app,
      spaceContext,
      appContext,
      identity: {
        spaceId: space.id,
        appId: app.id,
        actorId: bootstrap.user.id,
      },
      gaps: [...spaceProjection.gaps, ...appProjection.gaps],
    };
  } catch (error) {
    await kernel.close();
    throw error;
  }
}

/** Reopens an existing Builder topology from the host's local login/session identity. */
export async function openBuilderKernel(
  input: OpenBuilderKernelInput,
): Promise<BuilderKernelInstance> {
  const kernel = await Kernel.open(input.kernel);
  try {
    const { spaceId, appId, actorId } = input.identity;
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
      throw new Error("Builder Kernel identity does not resolve to one Space and App.");
    }
    return {
      kernel,
      space,
      app,
      spaceContext,
      appContext,
      identity: { spaceId: space.id, appId: app.id, actorId: actor.id },
    };
  } catch (error) {
    await kernel.close();
    throw error;
  }
}

/** Opens the existing local Builder topology, seeding it only when the catalog is empty. */
export async function startBuilderKernel(
  input: StartBuilderKernelInput,
): Promise<BuilderKernelStart> {
  const identity = await discoverBuilderIdentity(input.kernel, input.preferred);
  if (identity) {
    return {
      ...(await openBuilderKernel({ identity, kernel: input.kernel })),
      created: false,
      gaps: [],
    };
  }
  const created = await bootstrapBuilderKernel({ ...input.seed, kernel: input.kernel });
  return { ...created, created: true };
}

async function discoverBuilderIdentity(
  options: KernelOptions,
  preferred: Partial<BuilderKernelIdentity> | undefined,
): Promise<BuilderKernelIdentity | null> {
  const session = await options.persistence.open();
  try {
    const roots = await session.catalog.listRootWorkspaces();
    if (!roots.length) return null;
    const space = roots.find((workspace) => workspace.id === preferred?.spaceId) ?? roots.at(0)!;
    const users = (await session.catalog.listActorsByOrigin(space.id)).filter(
      (actor) => actor.kind === "user",
    );
    const actor = users.find((candidate) => candidate.id === preferred?.actorId) ?? users.at(0);
    if (!actor) throw new Error(`Builder Space ${space.id} has no locally issued user.`);
    const memberOf = new Set(
      (await session.catalog.listMembershipsForActor(actor.id)).map(
        (membership) => membership.workspaceId,
      ),
    );
    const apps = (await session.catalog.listChildWorkspaces(space.id)).filter((workspace) =>
      memberOf.has(workspace.id),
    );
    const app = apps.find((workspace) => workspace.id === preferred?.appId) ?? apps.at(0);
    if (!app) throw new Error(`Builder Space ${space.id} has no accessible App.`);
    return { spaceId: space.id, appId: app.id, actorId: actor.id };
  } finally {
    await session.close();
  }
}
