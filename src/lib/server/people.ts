import { createWorkspaceClient, type WorkspaceClient } from "@jthum/framework/client";
import { PERMISSIONS, type Kernel, type Permission } from "@jthum/framework/kernel";
import { invalidInput, resourceNotFound } from "@jthum/framework/errors";
import type { CatalogRepository } from "@jthum/framework/persistence";
import type { AppContext } from "$lib/framework/bootstrap.ts";
import type { PeopleInfo } from "$lib/app/access.ts";
import { ServerAuth, type Identity } from "./auth.ts";
import type { MemberQuery } from "@jthum/framework/client";

/** Host login administration composed from ordinary Workspace memberships. */
export class PeopleService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly kernel: Kernel,
    private readonly auth: ServerAuth,
    private readonly catalog: CatalogRepository,
  ) {}

  async list(context: AppContext, query: MemberQuery = {}): Promise<PeopleInfo> {
    // Authorize before discovering any host-owned App or login metadata.
    const page = await context.spaceClient.queryMembers({ ...query, kind: "user" });
    const [logins, children] = await Promise.all([
      this.auth.localLogins(
        context.space.id,
        page.members.map(({ actor }) => actor.id),
      ),
      this.catalog.listChildWorkspaces(context.space.id),
    ]);
    const apps: { id: string; name: string }[] = [];
    const appMemberships = new Map<string, Map<string, readonly Permission[]>>();
    for (const child of children) {
      const membership = await this.catalog.getMembership(context.actorId, child.id);
      // Parent management does not grant access to a child Workspace's membership roster.
      if (!membership?.permissions.includes("manage") || !child.access.members.includes("manage"))
        continue;
      const client = await this.appClient(context, child.id);
      await client.getMembership(context.actorId); // Target authorization, without loading its roster.
      appMemberships.set(
        child.id,
        new Map(
          await Promise.all(
            page.members.map(
              async ({ actor }) =>
                [
                  actor.id,
                  (await this.catalog.getMembership(actor.id, child.id))?.permissions ?? [],
                ] as const,
            ),
          ),
        ),
      );
      apps.push({ id: child.id, name: child.name });
    }
    return {
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      people: page.members.map(({ actor, membership }) => ({
        actor,
        username: logins.find((login) => login.actorId === actor.id)?.username,
        permissions: membership.permissions,
        apps: apps.map((app) => ({
          appId: app.id,
          permissions: appMemberships.get(app.id)?.get(actor.id) ?? [],
        })),
      })),
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
    await context.spaceClient.getMembership(context.actorId); // Kernel manage check, never a role-name check.
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
    const actor = await this.catalog.getActor(actorId);
    if (
      !actor ||
      actor.kind !== "user" ||
      !(await this.catalog.getMembership(actorId, context.space.id))
    )
      throw resourceNotFound("User", actorId);
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
      const membership = await this.catalog.getMembership(actorId, app.appId);
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
      await client.getMembership(context.actorId); // Explicit target-App manage check before any writes.
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
