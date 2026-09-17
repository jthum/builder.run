import {
  Kernel,
  type ExecutionContext,
  type KernelOptions,
  type Workspace,
} from "@jthum/framework/kernel";
import type { Spec } from "@jthum/framework/spec";
import type { AppSpec, TypeDef } from "$lib/runtime/model.ts";
import { projectFrameworkSpec, type FrameworkProjectionGap } from "./projection.ts";

export interface BuilderKernelSeed {
  readonly spaceName: string;
  readonly appName: string;
  readonly user: { readonly name: string; readonly email?: string };
  readonly spaceSpec: AppSpec;
  readonly appSpec: AppSpec;
  /** Shared Type definitions installed in the Space and bound into the App. */
  readonly sharedTypes: readonly TypeDef[];
}

export interface AppSelection {
  readonly spaceId: string;
  readonly appId: string;
}

export interface CreateBuilderKernelInput extends BuilderKernelSeed {
  readonly kernel: KernelOptions;
}

export interface OpenBuilderKernelInput {
  readonly kernel: KernelOptions;
  readonly seed: BuilderKernelSeed;
  /** Optional local UI preferences; the persisted catalog remains authoritative. */
  readonly preferredSelection?: Partial<AppSelection>;
  readonly preferredActorId?: string;
}

export interface BuilderAppContext {
  readonly space: Workspace;
  readonly app: Workspace;
  readonly spaceContext: ExecutionContext;
  readonly appContext: ExecutionContext;
  readonly selection: AppSelection;
  readonly actorId: string;
}

export interface BuilderKernelInstance extends BuilderAppContext {
  readonly kernel: Kernel;
}

export interface CreatedBuilderKernel extends BuilderKernelInstance {
  /** Deliberate capabilities waiting on later framework phases. */
  readonly gaps: readonly FrameworkProjectionGap[];
}

export type OpenedBuilderKernel =
  | (CreatedBuilderKernel & { readonly isNew: true })
  | (BuilderKernelInstance & { readonly isNew: false });

/**
 * Creates the Builder Space/App topology on the Framework Kernel.
 *
 * This seeds the canonical Framework database and never reads the old Builder database.
 */
export async function createBuilderKernel(
  input: CreateBuilderKernelInput,
): Promise<CreatedBuilderKernel> {
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
    const child = await kernel.createWorkspace(spaceContext, { name: input.appName });
    const appContext = { ...spaceContext, workspaceId: child.workspace.id };
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
      selection: {
        spaceId: space.id,
        appId: app.id,
      },
      actorId: root.user.id,
      gaps: [...spaceProjection.gaps, ...appProjection.gaps],
    };
  } catch (error) {
    await kernel.close();
    throw error;
  }
}

/** Resolves Builder's Space/App convention for an Actor on an already-open Kernel. */
export async function resolveBuilderApp(
  kernel: Kernel,
  selection: AppSelection,
  actorId: string,
): Promise<BuilderAppContext> {
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
    throw new Error("Builder selection does not resolve to one Space and App for this Actor.");
  }
  return {
    space,
    app,
    spaceContext,
    appContext,
    selection: { spaceId: space.id, appId: app.id },
    actorId: actor.id,
  };
}

/** Opens the local Builder topology, creating it only when the catalog is empty. */
export async function openBuilderKernel(
  input: OpenBuilderKernelInput,
): Promise<OpenedBuilderKernel> {
  const startup = await findBuilderStartup(
    input.kernel,
    input.preferredSelection,
    input.preferredActorId,
  );
  if (startup) {
    const kernel = await Kernel.open(input.kernel);
    try {
      return {
        kernel,
        ...(await resolveBuilderApp(kernel, startup.selection, startup.actorId)),
        isNew: false,
      };
    } catch (error) {
      await kernel.close();
      throw error;
    }
  }
  const created = await createBuilderKernel({ ...input.seed, kernel: input.kernel });
  return { ...created, isNew: true };
}

async function findBuilderStartup(
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
    if (!actor) throw new Error(`Builder Space ${space.id} has no locally issued user.`);
    const memberOf = new Set(
      (await persistence.catalog.listMembershipsForActor(actor.id)).map(
        (membership) => membership.workspaceId,
      ),
    );
    const apps = (await persistence.catalog.listChildWorkspaces(space.id)).filter((workspace) =>
      memberOf.has(workspace.id),
    );
    const app = apps.find((workspace) => workspace.id === preferredSelection?.appId) ?? apps.at(0);
    if (!app) throw new Error(`Builder Space ${space.id} has no accessible App.`);
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
