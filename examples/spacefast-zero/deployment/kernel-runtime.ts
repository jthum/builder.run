import {
  Kernel,
  PERMISSIONS,
  type Actor,
  type ExecutionContext,
  type IdGenerator,
  type Workspace,
} from "@jthum/framework/kernel";
import { createWorkspaceClient } from "@jthum/framework/client";
import { FrameworkError, ERROR_CODES } from "@jthum/framework/errors";
import type { Deployment, ZeroReadDatabase } from "./model.ts";
import { ZeroPersistenceAdapter } from "./persistence.ts";
import { ZeroRequestTransaction } from "./transaction.ts";
import { ZeroCatalogRepository } from "./catalog.ts";

export interface RuntimeIdentity {
  readonly subject: string;
  readonly email: string;
  readonly name: string;
}

/** The native transaction allocates one sequence per write invocation; IDs never grant access. */
export async function openKernelRuntime(
  db: ZeroReadDatabase,
  deployment: Deployment,
  identity: RuntimeIdentity,
  options: { readonly writable: boolean; readonly releaseId: string; readonly ownerEmail: string },
) {
  if (!options.ownerEmail.trim() || !identity.email.trim() || !identity.subject.trim())
    throw new FrameworkError({
      code: ERROR_CODES.permissionDenied,
      message: "Verified identity and deployment owner configuration are required.",
    });
  const transaction = new ZeroRequestTransaction(db);
  const preflight = new ZeroCatalogRepository(transaction.db);
  const existingWorkspace = await preflight.getWorkspace(deployment.workspaceId);
  const existingLink = await transaction.db
    .auth_links!.withIndex("by_subject", (range) => range.eq("subject", identity.subject))
    .first();
  const existingActor = existingLink
    ? await preflight.getActor(existingLink.actor as string)
    : existingWorkspace
      ? ((await preflight.listActorsByOrigin(existingWorkspace.id)).find(
          (actor) =>
            actor.kind === "user" && actor.email?.toLowerCase() === identity.email.toLowerCase(),
        ) ?? null)
      : null;
  const isOwner = identity.email.toLowerCase() === options.ownerEmail.toLowerCase();
  if (
    (!existingActor && !isOwner) ||
    (existingActor && !(await preflight.getMembership(existingActor.id, deployment.workspaceId)))
  )
    throw new FrameworkError({
      code: ERROR_CODES.permissionDenied,
      message: "You have not been invited to this app.",
    });
  let sequence = 0;
  if (options.writable) {
    const previous = await transaction.db
      .runtime_state!.withIndex("by_key", (range) => range.eq("key", "sequence"))
      .first();
    sequence = Number(previous?.sequence ?? 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new Error("Runtime identity sequence exhausted.");
    if (previous) await transaction.db.runtime_state!.update(previous.id, { sequence });
    else await transaction.db.runtime_state!.insert({ key: "sequence", sequence });
  }
  let counter = 0;
  const ids: IdGenerator = {
    create() {
      if (!options.writable)
        throw new FrameworkError({
          code: ERROR_CODES.persistenceUnsupported,
          message: "This request is read-only.",
        });
      return `${options.releaseId}_${sequence.toString(36)}_${(++counter).toString(36)}`;
    },
  };
  const adapter = new ZeroPersistenceAdapter(transaction.db, deployment);
  const session = await adapter.open();
  const kernel = await Kernel.open({
    persistence: { kind: adapter.kind, open: async () => session },
    ids,
    environment: {
      multiplayer: true,
      durableRuleExecution: true,
      schedules: false,
      webhooks: true,
      inference: false,
    },
  });
  try {
    let workspace = await session.catalog.getWorkspace(deployment.workspaceId);
    const owner = identity.email.toLowerCase() === options.ownerEmail.toLowerCase();
    if (!workspace) {
      if (!owner || !options.writable)
        throw new FrameworkError({
          code: ERROR_CODES.permissionDenied,
          message: "The deployment owner must initialize this app.",
        });
      const stamp = new Date().toISOString();
      workspace = {
        id: deployment.workspaceId,
        isRoot: true,
        parentId: null,
        rootId: deployment.workspaceId,
        name: deployment.spec.label,
        access: { members: [...PERMISSIONS], others: [] },
        policy: { spawn: false, createActors: true, reshare: false },
        spec: deployment.spec,
        createdAt: stamp,
        updatedAt: stamp,
      } satisfies Workspace;
      await session.catalog.transaction((tx) => tx.insertWorkspace(workspace!));
      await session.catalog.transaction(async (tx) => {
        const system: Actor = {
          id: ids.create("actor"),
          kind: "system",
          originId: workspace!.id,
          rootId: workspace!.rootId,
          name: "System",
          createdAt: stamp,
          updatedAt: stamp,
        };
        await tx.insertActor(system);
        await tx.insertMembership({
          id: ids.create("membership"),
          actorId: system.id,
          workspaceId: workspace!.id,
          roles: ["system"],
          permissions: [...PERMISSIONS],
          createdAt: stamp,
          updatedAt: stamp,
        });
      });
      await session.subscriptions.replace(workspace.id, undefined, deployment.spec.rules);
    }
    let link = await transaction.db
      .auth_links!.withIndex("by_subject", (range) => range.eq("subject", identity.subject))
      .first();
    let actor: Actor | null = link ? await session.catalog.getActor(link.actor as string) : null;
    if (!actor) {
      if (!options.writable)
        throw new FrameworkError({
          code: ERROR_CODES.permissionDenied,
          message: "Connect to the app before making read requests.",
        });
      const candidates = await session.catalog.listActorsByOrigin(workspace.id);
      actor =
        candidates.find(
          (candidate) =>
            candidate.kind === "user" &&
            candidate.email?.toLowerCase() === identity.email.toLowerCase(),
        ) ?? null;
      if (!actor && !owner)
        throw new FrameworkError({
          code: ERROR_CODES.permissionDenied,
          message: "You have not been invited to this app.",
        });
      if (!actor) {
        const stamp = new Date().toISOString();
        actor = {
          id: ids.create("actor"),
          kind: "user",
          originId: workspace.id,
          rootId: workspace.rootId,
          name: identity.name,
          email: identity.email,
          createdAt: stamp,
          updatedAt: stamp,
        };
        const user = actor;
        await session.catalog.transaction(async (tx) => {
          await tx.insertActor(user);
          await tx.insertMembership({
            id: ids.create("membership"),
            actorId: user.id,
            workspaceId: workspace!.id,
            roles: ["owner"],
            permissions: [...PERMISSIONS],
            createdAt: stamp,
            updatedAt: stamp,
          });
        });
      }
      const value = { subject: identity.subject, actor: actor.id };
      if (link) await transaction.db.auth_links!.update(link.id, value);
      else link = await transaction.db.auth_links!.insert(value);
    }
    if (options.writable && JSON.stringify(workspace.spec) !== JSON.stringify(deployment.spec)) {
      await session.applyWorkspaceSpec({
        ...workspace,
        spec: deployment.spec,
        updatedAt: new Date().toISOString(),
      });
    }
    const context: ExecutionContext = { workspaceId: workspace.id, actorId: actor.id };
    const client = await createWorkspaceClient(kernel, context);
    transaction.assertHealthy();
    return { kernel, client, context, session, transaction, close: () => kernel.close() };
  } catch (error) {
    await kernel.close();
    if (options.writable) transaction.abort(error);
    throw error;
  }
}
