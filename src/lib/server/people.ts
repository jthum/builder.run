import { createWorkspaceClient, type WorkspaceClient } from "@jthum/framework/client";
import { PERMISSIONS, type Kernel, type Permission } from "@jthum/framework/kernel";
import { invalidInput, resourceNotFound } from "@jthum/framework/errors";
import type { CatalogRepository } from "@jthum/framework/persistence";
import type { AppContext } from "$lib/framework/bootstrap.ts";
import type { PeopleInfo } from "$lib/app/access.ts";
import { ServerAuth, type Identity } from "./auth.ts";

/** Host login administration composed from ordinary Workspace memberships. */
export class PeopleService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly kernel: Kernel,
    private readonly auth: ServerAuth,
    private readonly catalog: CatalogRepository,
  ) {}

  async list(context: AppContext): Promise<PeopleInfo> {
    const memberships = await context.spaceClient.listMembershipsForWorkspace();
    const [actors, logins, children] = await Promise.all([
      context.spaceClient.listMembers(),
      this.auth.localLogins(context.space.id),
      this.catalog.listChildWorkspaces(context.space.id),
    ]);
    const apps: { id: string; name: string }[] = [];
    const appMemberships = new Map<
      string,
      Awaited<ReturnType<WorkspaceClient["listMembershipsForWorkspace"]>>
    >();
    for (const child of children) {
      const membership = await this.catalog.getMembership(context.actorId, child.id);
      // Parent management does not grant access to a child Workspace's membership roster.
      if (!membership?.permissions.includes("manage") || !child.access.members.includes("manage"))
        continue;
      const client = await this.appClient(context, child.id);
      appMemberships.set(child.id, await client.listMembershipsForWorkspace());
      apps.push({ id: child.id, name: child.name });
    }
    return {
      people: actors
        .filter((actor) => actor.kind === "user")
        .map((actor) => ({
          actor,
          username: logins.find((login) => login.actorId === actor.id)?.username,
          permissions: memberships.find((member) => member.actorId === actor.id)?.permissions ?? [],
          apps: apps.map((app) => ({
            appId: app.id,
            permissions:
              appMemberships.get(app.id)?.find((member) => member.actorId === actor.id)
                ?.permissions ?? [],
          })),
        }))
        .sort((left, right) => left.actor.name.localeCompare(right.actor.name)),
      apps,
      signInUrl: `/?realm=${encodeURIComponent(context.space.id)}`,
    };
  }

  mutate(
    identity: Identity,
    context: AppContext,
    operation: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    // Serialize host provisioning/removal and recheck authority inside the queue.
    const pending = this.queue.then(async () => {
      await this.auth.assertActive(identity);
      await this.apply(context, operation, input);
    });
    this.queue = pending.catch(() => {});
    return pending;
  }

  private async apply(
    context: AppContext,
    operation: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await context.spaceClient.listMembershipsForWorkspace(); // Kernel manage check, never a role-name check.
    if (operation === "create") {
      const name = requiredText(input.name, "Name");
      const username = requiredText(input.username, "Username");
      const password = requiredText(input.password, "Password");
      const permissions = readPermissions(input.permissions ?? ["read"]);
      const apps = await this.appGrants(
        context,
        input.apps ?? [{ appId: context.app.id, permissions: ["read"] }],
      );
      if (!permissions.includes("read") || !apps.some((app) => app.permissions.includes("read")))
        throw invalidInput("Give the new user Space access and access to at least one App.");
      await this.auth.createLogin(context.space.id, username, password, async () => {
        const member = await context.spaceClient.createMember({ name, permissions });
        for (const app of apps)
          if (app.permissions.length)
            await app.client.addMembership({
              actorId: member.actor.id,
              workspaceId: app.appId,
              permissions: app.permissions,
            });
        return { [context.space.id]: member.actor.id };
      });
      return;
    }
    const actorId = requiredText(input.actorId, "User");
    if (actorId === context.actorId)
      throw invalidInput(
        "Use Profile settings for your own login. You cannot change your own access here.",
      );
    const actor = (await context.spaceClient.listMembers()).find(
      (person) => person.id === actorId && person.kind === "user",
    );
    if (!actor) throw resourceNotFound("User", actorId);
    if (operation === "revokeSessions") {
      await this.auth.revokeActorSessions(context.space.id, actor.id);
      return;
    }
    if (operation === "remove") {
      // Preserve historical Actor references. The host also checks Space access on every App request.
      await context.spaceClient.updateMembership({
        actorId,
        workspaceId: context.space.id,
        permissions: [],
      });
      await this.auth.revokeActorSessions(context.space.id, actorId);
      return;
    }
    if (operation !== "update") throw invalidInput("Unknown people operation.");
    const permissions = readPermissions(input.permissions);
    const apps = await this.appGrants(context, input.apps ?? []);
    for (const app of apps) {
      const membership = (await app.client.listMembershipsForWorkspace()).find(
        (member) => member.actorId === actorId,
      );
      if (membership)
        await app.client.updateMembership({
          actorId,
          workspaceId: app.appId,
          permissions: app.permissions,
        });
      else if (app.permissions.length)
        await app.client.addMembership({
          actorId,
          workspaceId: app.appId,
          permissions: app.permissions,
        });
    }
    await context.spaceClient.updateMembership({
      actorId,
      workspaceId: context.space.id,
      permissions,
    });
  }

  private async appGrants(context: AppContext, value: unknown) {
    if (!Array.isArray(value)) throw invalidInput("App permissions must be a list.");
    const ids = new Set<string>();
    const grants = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw invalidInput("Invalid App permissions.");
      const appId = requiredText(entry.appId, "App");
      if (ids.has(appId)) throw invalidInput("An App can only appear once.");
      ids.add(appId);
      const permissions = readPermissions(entry.permissions);
      const client = await this.appClient(context, appId);
      await client.listMembershipsForWorkspace(); // Explicit target-App manage check before any writes.
      grants.push({ appId, client, permissions });
    }
    return grants;
  }

  private async appClient(context: AppContext, appId: string): Promise<WorkspaceClient> {
    const app = await this.catalog.getWorkspace(appId);
    if (!app || app.parentId !== context.space.id || app.isRoot)
      throw resourceNotFound("App", appId);
    return createWorkspaceClient(this.kernel, { workspaceId: appId, actorId: context.actorId });
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw invalidInput(`${label} required.`);
  return value;
}

function readPermissions(value: unknown): Permission[] {
  if (!Array.isArray(value) || value.some((permission) => !PERMISSIONS.includes(permission)))
    throw invalidInput("Choose valid permissions.");
  const permissions = PERMISSIONS.filter((permission) => value.includes(permission));
  if (permissions.length && !permissions.includes("read"))
    throw invalidInput("Include Read when granting access.");
  return permissions;
}
