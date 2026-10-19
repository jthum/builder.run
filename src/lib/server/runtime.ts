import { AsyncLocalStorage } from "node:async_hooks";
import { createWorkspaceClient, type WorkspaceClient } from "@jthum/framework/client";
import { FrameworkError, invalidInput, resourceNotFound } from "@jthum/framework/errors";
import {
  Kernel,
  type InferenceEvent,
  type InferenceRuntime,
  type Workspace,
} from "@jthum/framework/kernel";
import {
  resolveApp,
  createSpace,
  deleteApp,
  type AppContext,
  type AppRuntime,
  type AppSelection,
} from "$lib/framework/bootstrap.ts";
import { emptySpec } from "$lib/framework/bootstrap.ts";
import { encodeRuntimeInfo } from "$lib/framework/runtime-info.ts";
import { seedApp } from "$lib/app/app-templates.ts";
import { createAssistantTools } from "$lib/inference/assistant-tools.ts";
import { createInferenceRuntime } from "$lib/inference/runtime.ts";
import type { ToolContext } from "$lib/app/webmcp.ts";
import type { RemoteSnapshot } from "$lib/app/remote-contract.ts";
import { ServerAuth, authenticationRequired, type Identity } from "./auth.ts";
import { openServerStorage } from "./storage.ts";
import { workspaceDatabaseName } from "$lib/framework/sqlite.ts";
import { PeopleService } from "./people.ts";
import { assertEmptySetup, provisionServer } from "./setup.ts";

interface AssistantRun {
  identity: Identity;
  runtime: AppRuntime;
  readonly tools: ToolContext;
}
export interface ServerOptions {
  readonly directory: string;
  readonly inference?: InferenceRuntime;
}

/** One Kernel/storage lifetime per server process; request identity and assistant state stay isolated. */
export class ServerRuntime {
  private readonly revisions = new Map<string, number>();
  private settingUp = false;
  private peopleService?: PeopleService;
  private closed = false;
  private constructor(
    readonly kernel: Kernel,
    private loginAuth: ServerAuth | undefined,
    private readonly storage: Awaited<ReturnType<typeof openServerStorage>>,
    private readonly inferenceRuns: AsyncLocalStorage<AssistantRun>,
  ) {}

  get setupRequired(): boolean {
    return !this.loginAuth;
  }

  get auth(): ServerAuth {
    if (!this.loginAuth)
      throw new FrameworkError({
        code: "AUTH.SETUP_REQUIRED",
        message: "Create your first login to get started.",
      });
    return this.loginAuth;
  }

  private get people(): PeopleService {
    return (this.peopleService ??= new PeopleService(
      this.kernel,
      this.auth,
      this.storage.catalog(),
    ));
  }

  async setup(input: unknown): Promise<void> {
    if (this.loginAuth || this.settingUp)
      throw new FrameworkError({
        code: "RESOURCE.CONFLICT",
        message: "Setup is already complete or in progress. Sign in to continue.",
      });
    this.settingUp = true;
    try {
      const created = await provisionServer(this.kernel, this.storage, input);
      this.loginAuth = created.auth;
    } finally {
      this.settingUp = false;
    }
  }

  static async open(options: ServerOptions): Promise<ServerRuntime> {
    const storage = await openServerStorage(options.directory);
    const runs = new AsyncLocalStorage<AssistantRun>();
    let runtime: ServerRuntime | undefined;
    const assistantTools = {
      resolve: async (
        caller: Parameters<ReturnType<typeof createAssistantTools>["resolve"]>[0],
      ) => {
        const run = runs.getStore();
        if (!run || !runtime) return [];
        await runtime.assertAssistantAccess(run);
        const tools = await createAssistantTools(run.tools).resolve(caller);
        return tools.map((tool) => ({
          ...tool,
          execute: async (...args: Parameters<typeof tool.execute>) => {
            await runtime!.assertAssistantAccess(run);
            return tool.execute(...args);
          },
        }));
      },
    };
    const inference =
      options.inference ??
      createInferenceRuntime({
        assistantTools,
        loadSettings: async () => {
          const run = runs.getStore();
          if (!runtime || !run)
            throw invalidInput("Select a persisted model for background inference.");
          return runtime.auth.getAssistantSettings(run.identity, storage.secretCipher, true);
        },
      });
    let kernel: Kernel | undefined;
    try {
      const realm = await storage.readRealm();
      kernel = await Kernel.open({
        persistence: storage.persistence,
        secretCipher: storage.secretCipher,
        inference,
        inferenceTools: [assistantTools],
        environment: {
          durableRuleExecution: true,
          multiplayer: true,
          inference: true,
          schedules: false,
          webhooks: false,
        },
      });
      if (!realm) {
        await assertEmptySetup(storage);
        runtime = new ServerRuntime(kernel, undefined, storage, runs);
        return runtime;
      }
      const root = await storage.catalog().getWorkspace(realm);
      if (!root?.isRoot)
        throw new Error(
          "The login realm does not identify a root Workspace. Restore a complete data-directory backup.",
        );
      const auth = await ServerAuth.open(kernel, realm);
      if (!(await auth.hasLogins()))
        throw new Error(
          "This instance has no login. Setup did not complete; use a new data directory or restore a complete backup.",
        );
      runtime = new ServerRuntime(kernel, auth, storage, runs);
      return runtime;
    } catch (error) {
      try {
        await kernel?.close();
      } finally {
        await storage.release();
      }
      throw error;
    }
  }

  changed(spaceId: string): void {
    this.revisions.set(spaceId, (this.revisions.get(spaceId) ?? 0) + 1);
  }

  async context(identity: Identity, selection?: Partial<AppSelection>): Promise<AppContext> {
    const spaceId = selection?.spaceId ?? Object.keys(identity.login.actors)[0];
    if (!spaceId || !Object.hasOwn(identity.login.actors, spaceId)) throw authenticationRequired();
    const actorId = identity.login.actors[spaceId]!;
    const rootContext = { workspaceId: spaceId, actorId };
    const spaceClient = await createWorkspaceClient(this.kernel, rootContext);
    await spaceClient.getWorkspace();
    const children = await this.storage.catalog().listChildWorkspaces(spaceId);
    let appId = selection?.appId;
    if (!appId) {
      for (const child of children) {
        const member = await this.storage.catalog().getMembership(actorId, child.id);
        if (member?.permissions.includes("read") && child.access.members.includes("read")) {
          appId = child.id;
          break;
        }
      }
    }
    if (!appId || !children.some((child) => child.id === appId))
      throw resourceNotFound("App", appId ?? "");
    return resolveApp(this.kernel, { spaceId, appId }, actorId);
  }

  async snapshot(identity: Identity, selection?: Partial<AppSelection>): Promise<RemoteSnapshot> {
    const context = await this.context(identity, selection);
    const actor = await context.spaceClient.getActor(context.actorId);
    if (!actor) throw authenticationRequired();
    const membership = await this.storage.catalog().getMembership(actor.id, context.space.id);
    const appMembership = await this.storage.catalog().getMembership(actor.id, context.app.id);
    const permissions = {
      space:
        membership?.permissions.filter((permission) =>
          context.space.access.members.includes(permission),
        ) ?? [],
      app:
        appMembership?.permissions.filter((permission) =>
          context.app.access.members.includes(permission),
        ) ?? [],
    };
    const roles = permissions.space.includes("manage") ? ["admin"] : ["member"];
    const spaces = [];
    for (const [spaceId, actorId] of Object.entries(identity.login.actors)) {
      try {
        const client = await createWorkspaceClient(this.kernel, { workspaceId: spaceId, actorId });
        spaces.push(await client.getWorkspace());
      } catch (error) {
        if (
          !(error instanceof FrameworkError) ||
          !["PERMISSION.DENIED", "RESOURCE.NOT_FOUND"].includes(error.code)
        )
          throw error;
      }
    }
    const apps: Workspace[] = [];
    for (const child of await this.storage.catalog().listChildWorkspaces(context.space.id)) {
      const member = await this.storage.catalog().getMembership(actor.id, child.id);
      if (member?.permissions.includes("read") && child.access.members.includes("read"))
        apps.push(child);
    }
    const actors = permissions.space.includes("manage")
      ? (await context.spaceClient.listActorsByOrigin()).map((person) => ({
          ...person,
          roles: person.id === actor.id ? roles : ["member"],
        }))
      : [{ ...actor, roles }];
    return {
      realmId: identity.realmId,
      selection: context.selection,
      actorId: context.actorId,
      space: context.space,
      app: context.app,
      apps,
      spaces,
      actor: { ...actor, roles },
      actors,
      profiles: encodeRuntimeInfo(context.profiles),
      permissions,
      revision: this.revisions.get(context.space.id) ?? 0,
      databases: permissions.space.includes("manage")
        ? (await this.storage.inspect()).filter(
            ({ name }) =>
              name === "catalog.db" ||
              [context.space, ...apps].some(
                (workspace) => workspaceDatabaseName(workspace.id) === name,
              ),
          )
        : [],
    };
  }

  async workspaceClient(
    identity: Identity,
    workspaceId: string,
    spaceId: string,
    appId?: string,
  ): Promise<WorkspaceClient> {
    if (!Object.hasOwn(identity.login.actors, spaceId)) throw authenticationRequired();
    // A login's Space access is a host entry condition, not inherited Kernel ACL.
    const root = await createWorkspaceClient(this.kernel, {
      workspaceId: spaceId,
      actorId: identity.login.actors[spaceId]!,
    });
    await root.getWorkspace();
    const client = await createWorkspaceClient(this.kernel, {
      workspaceId,
      actorId: identity.login.actors[spaceId]!,
    });
    const workspace = await client.getWorkspace();
    if (workspace.rootId !== spaceId) throw authenticationRequired();
    const wrapped = Object.create(client) as WorkspaceClient;
    wrapped.runInference = async (input) => {
      const context = await this.context(identity, { spaceId, ...(appId ? { appId } : {}) });
      const run = this.assistantRun(identity, context);
      const stream = await this.inferenceRuns.run(run, () => client.runInference(input));
      return this.withInferenceContext(stream, run);
    };
    return wrapped;
  }

  private async assertAssistantAccess(run: AssistantRun): Promise<void> {
    await this.auth.assertActive(run.identity);
    await run.runtime.spaceClient.getWorkspace();
    await run.runtime.appClient.getWorkspace();
  }

  private async *withInferenceContext(
    stream: AsyncIterable<InferenceEvent>,
    run: AssistantRun,
  ): AsyncIterable<InferenceEvent> {
    const iterator = stream[Symbol.asyncIterator]();
    try {
      for (;;) {
        const next = await this.inferenceRuns.run(run, () => iterator.next());
        if (next.done) break;
        yield next.value;
      }
    } finally {
      await this.inferenceRuns.run(run, () => iterator.return?.());
      this.changed(run.runtime.space.id);
    }
  }

  private assistantRun(identity: Identity, initial: AppContext): AssistantRun {
    const run: AssistantRun = {
      identity,
      runtime: { ...initial, kernel: this.kernel },
      tools: {
        runtime: () => run.runtime,
        spec: () => run.runtime.app.spec,
        changed: async () => {
          run.runtime = {
            ...run.runtime,
            ...(await resolveApp(this.kernel, run.runtime.selection, run.runtime.actorId)),
          };
          this.changed(run.runtime.space.id);
        },
        createApp: async (name, template) => {
          run.runtime = { ...run.runtime, ...(await seedApp(run.runtime, name, template)) };
        },
        selectApp: async (appId) => {
          run.runtime = {
            ...run.runtime,
            ...(await this.context(run.identity, { spaceId: run.runtime.space.id, appId })),
          };
        },
        deleteApp: async (appId) => {
          run.runtime = {
            ...run.runtime,
            ...(await deleteApp(this.kernel, run.runtime.spaceContext, appId)),
          };
        },
        createSpace: async (name) => {
          run.runtime = { ...run.runtime, ...(await this.newSpace(identity, name, run.runtime)) };
          run.identity = await this.auth.refreshIdentity(run.identity);
        },
      },
    };
    return run;
  }

  async newSpace(identity: Identity, name: string, context: AppContext): Promise<AppContext> {
    // This host intentionally issues a new Actor in each independent Space, as the local app does.
    const actor = await context.spaceClient.getActor(context.actorId);
    if (!actor) throw authenticationRequired();
    const next = await createSpace(this.kernel, {
      spaceName: name,
      appName: "Home",
      user: { name: actor.name, ...(actor.email ? { email: actor.email } : {}) },
      spaceSpec: emptySpec("space", name),
      appSpec: emptySpec("home", "Home"),
    });
    await this.auth.linkActor(identity, next.space.id, next.actorId);
    this.changed(context.space.id);
    this.changed(next.space.id);
    return next;
  }

  async command(
    identity: Identity,
    command: string,
    selection: Partial<AppSelection> | undefined,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    if (command === "revision") {
      const spaceId = selection?.spaceId ?? Object.keys(identity.login.actors)[0];
      if (!spaceId || !Object.hasOwn(identity.login.actors, spaceId))
        throw authenticationRequired();
      const root = await createWorkspaceClient(this.kernel, {
        workspaceId: spaceId,
        actorId: identity.login.actors[spaceId]!,
      });
      await root.getWorkspace();
      return this.revisions.get(spaceId) ?? 0;
    }
    if (command === "security.get") return this.auth.security(identity);
    if (command === "security.password") {
      if (typeof input.currentPassword !== "string" || typeof input.password !== "string")
        throw invalidInput("Current and new passwords required.");
      await this.auth.changePassword(identity, input.currentPassword, input.password);
      return this.auth.security(identity);
    }
    if (command === "security.revoke") {
      if (input.sessionId !== undefined && typeof input.sessionId !== "string")
        throw invalidInput("Invalid session.");
      await this.auth.revokeSession(identity, input.sessionId);
      return this.auth.security(identity);
    }
    if (command === "snapshot") return this.snapshot(identity, selection);
    if (command === "assistant.get")
      return this.auth.getAssistantSettings(identity, this.storage.secretCipher);
    if (command === "assistant.put") {
      await this.auth.putAssistantSettings(
        identity,
        input as unknown as Parameters<ServerAuth["putAssistantSettings"]>[1],
        this.storage.secretCipher,
      );
      return null;
    }
    const context = await this.context(identity, selection);
    if (command === "people.list") return this.people.list(context);
    if (command.startsWith("people.")) {
      try {
        await this.people.mutate(identity, context, command.slice("people.".length), input);
        return await this.people.list(context);
      } finally {
        this.changed(context.space.id);
      }
    }
    let next = context;
    const name = () => {
      if (typeof input.name !== "string" || !input.name.trim())
        throw invalidInput("Name required.");
      return input.name;
    };
    if (command === "createApp")
      next = await seedApp(
        { ...context, kernel: this.kernel },
        name(),
        typeof input.template === "string" ? input.template : undefined,
      );
    else if (command === "renameApp") await context.appClient.renameWorkspace({ name: name() });
    else if (command === "deleteApp") {
      if (typeof input.id !== "string") throw invalidInput("App ID required.");
      const fallback = await deleteApp(this.kernel, context.spaceContext, input.id);
      if (input.id === context.app.id) next = fallback;
    } else if (command === "createSpace") next = await this.newSpace(identity, name(), context);
    else if (command === "renameSpace") {
      await context.spaceClient.renameWorkspace({ name: name() });
      if (typeof input.accent === "string") {
        const space = await context.spaceClient.getWorkspace();
        await context.spaceClient.applySpec({
          ...space.spec,
          meta: { ...space.spec.meta, appearance: { accent: input.accent } },
        });
      }
    } else if (command === "updateProfile")
      await context.spaceClient.updateActor(context.actorId, {
        name: name(),
        ...(typeof input.email === "string" ? { email: input.email } : {}),
      });
    else throw invalidInput("Unknown app operation.");
    this.changed(context.space.id);
    const refreshed = await this.auth.refreshIdentity(identity);
    return this.snapshot(refreshed, next.selection);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.kernel.close();
    } finally {
      await this.storage.release();
    }
  }
}
