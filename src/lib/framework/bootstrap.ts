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
