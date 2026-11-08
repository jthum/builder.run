import { readAll } from "./page.ts";
import { resourceConflict, resourceNotFound } from "@jthum/framework/errors";
import {
  assertActorIntegrity,
  assertActorIdentityUnchanged,
  assertAgentConfigIdentityUnchanged,
  assertAgentConfigIntegrity,
  assertAttachmentIntegrity,
  assertAttachmentRevocation,
  assertMembershipIdentityUnchanged,
  assertMembershipIntegrity,
  assertModelConfigIdentityUnchanged,
  assertModelConfigIntegrity,
  assertWorkspaceIntegrity,
  assertWorkspaceTopologyUnchanged,
  MemoryCatalogRepository,
  type CatalogReader,
  type CatalogRepository,
  type CatalogTransaction,
} from "@jthum/framework/persistence";
import type {
  Actor,
  AgentConfig,
  Attachment,
  Membership,
  ModelConfig,
  Workspace,
} from "@jthum/framework/kernel";
import type { ZeroDatabase } from "./model.ts";

type Kind = "workspace" | "actor" | "model" | "agent" | "membership" | "attachment";
type Item = Workspace | Actor | ModelConfig | AgentConfig | Membership | Attachment;
type Change = { kind: Kind; key: string; value: Item | null };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const address = (kind: Kind, key: string) => JSON.stringify([kind, key]);
const objectKey = (kind: Kind, item: Item) =>
  kind === "agent" ? (item as AgentConfig).actorId : (item as Exclude<Item, AgentConfig>).id;

/** Callback writes are staged; reads see that small overlay. Native writes start only on success. */
export class ZeroCatalogRepository implements CatalogRepository {
  readonly reader: CatalogReader;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: ZeroDatabase) {
    this.reader = this.readers(new Map());
  }

  private native(kind: Kind, key: string) {
    return this.db
      .catalog_objects!.withIndex("by_identity", (range) => range.eq("kind", kind).eq("key", key))
      .first();
  }
  private readers(changes: Map<string, Change>, active = () => {}): CatalogReader {
    const get = async <T extends Item>(kind: Kind, key: string): Promise<T | null> => {
      active();
      const staged = changes.get(address(kind, key));
      if (staged) return copy(staged.value) as T | null;
      const row = await this.native(kind, key);
      return row ? (JSON.parse(row.payload as string) as T) : null;
    };
    const list = async <T extends Item>(kind: Kind, field: string, value: string): Promise<T[]> => {
      active();
      const rows = await readAll(() =>
        this.db.catalog_objects!.withIndex(`by_${field}`, (range) =>
          range.eq("kind", kind).eq(field, value),
        ),
      );
      const matches = (item: Item) => {
        const data = item as unknown as Record<string, unknown>;
        return field === "parent"
          ? (data.parentId ?? "") === value
          : field === "root"
            ? data.rootId === value
            : field === "workspace"
              ? data.workspaceId === value
              : field === "origin"
                ? data.originId === value
                : field === "actor"
                  ? data.actorId === value
                  : field === "target"
                    ? data.targetId === value
                    : data.modelConfigId === value;
      };
      const result = new Map(
        rows.map((row) => [row.key as string, JSON.parse(row.payload as string) as T]),
      );
      for (const change of changes.values())
        if (change.kind === kind) {
          result.delete(change.key);
          if (change.value && matches(change.value))
            result.set(change.key, copy(change.value) as T);
        }
      return [...result.values()];
    };
    const reader: CatalogReader = {
      getWorkspace: (id) => get<Workspace>("workspace", id),
      listRootWorkspaces: () => list<Workspace>("workspace", "parent", ""),
      listChildWorkspaces: (id) => list<Workspace>("workspace", "parent", id),
      listWorkspacesByRoot: (id) => list<Workspace>("workspace", "root", id),
      getActor: (id) => get<Actor>("actor", id),
      listActorsByOrigin: (id) => list<Actor>("actor", "origin", id),
      listActorsByRoot: (id) => list<Actor>("actor", "root", id),
      getModelConfig: (id) => get<ModelConfig>("model", id),
      listModelConfigs: (id) => list<ModelConfig>("model", "workspace", id),
      getAgentConfig: (id) => get<AgentConfig>("agent", id),
      listMembershipsForActor: (id) => list<Membership>("membership", "actor", id),
      listMembershipsForWorkspace: (id) => list<Membership>("membership", "workspace", id),
      getMembership: async (actor, workspace) =>
        (await list<Membership>("membership", "actor", actor)).find(
          (item) => item.workspaceId === workspace,
        ) ?? null,
      listMembers: async (workspace) => {
        const result: Actor[] = [];
        for (const member of await reader.listMembershipsForWorkspace(workspace)) {
          const actor = await reader.getActor(member.actorId);
          if (actor) result.push(actor);
        }
        return result;
      },
      queryMembers: async (workspace, query) => {
        // Reuse canonical roster semantics over the indexed, Workspace-restricted membership set.
        const members = await reader.listMembershipsForWorkspace(workspace);
        const other = query.memberOf
          ? await reader.listMembershipsForWorkspace(query.memberOf)
          : [];
        const actors = await reader.listMembers(workspace);
        const evaluator = new MemoryCatalogRepository();
        const state = evaluator.snapshot();
        state.actors = new Map(actors.map((actor) => [actor.id, actor]));
        state.memberships = new Map(
          [...members, ...other].map((membership) => [membership.id, membership]),
        );
        evaluator.restore(state);
        return evaluator.queryMembers(workspace, query);
      },
      getAttachment: (id) => get<Attachment>("attachment", id),
      getAttachmentBySource: async (target, source) =>
        (await list<Attachment>("attachment", "target", target)).find(
          (item) => item.sourceId === source && item.revokedAt === undefined,
        ) ?? null,
      listAttachmentsTo: (id) => list<Attachment>("attachment", "target", id),
      listAttachmentsFrom: (id) => list<Attachment>("attachment", "origin", id),
    };
    return reader;
  }

  transaction<T>(work: (transaction: CatalogTransaction) => Promise<T>): Promise<T> {
    const run = this.pending.then(async () => {
      const changes = new Map<string, Change>();
      let open = true;
      const active = () => {
        if (!open) throw resourceConflict("Catalog transaction is closed.");
      };
      const read = this.readers(changes, active);
      const stage = (kind: Kind, value: Item | null, key?: string) => {
        active();
        const identity = key ?? objectKey(kind, value!);
        changes.set(address(kind, identity), { kind, key: identity, value: copy(value) });
      };
      const insert = async (kind: Kind, value: Item, validate: () => Promise<void>) => {
        active();
        if (
          changes.get(address(kind, objectKey(kind, value)))?.value ||
          (!changes.has(address(kind, objectKey(kind, value))) &&
            (await this.native(kind, objectKey(kind, value))))
        )
          throw resourceConflict("Catalog object already exists.");
        await validate();
        if (changes.get(address(kind, objectKey(kind, value)))?.value)
          throw resourceConflict("Catalog object already exists.");
        stage(kind, value);
      };
      const required = async <T>(get: Promise<T | null>, key: string): Promise<T> => {
        active();
        const previous = await get;
        if (!previous) throw resourceNotFound("Catalog object", key);
        return previous;
      };
      const tx: CatalogTransaction = {
        ...read,
        insertWorkspace: (value) =>
          insert("workspace", value, () => assertWorkspaceIntegrity(read, value)),
        insertActor: (value) => insert("actor", value, () => assertActorIntegrity(read, value)),
        insertModelConfig: (value) =>
          insert("model", value, () => assertModelConfigIntegrity(read, value)),
        insertAgentConfig: (value) =>
          insert("agent", value, () => assertAgentConfigIntegrity(read, value)),
        insertMembership: (value) =>
          insert("membership", value, async () => {
            await assertMembershipIntegrity(read, value);
            if (await read.getMembership(value.actorId, value.workspaceId))
              throw resourceConflict("Actor is already a member.");
          }),
        insertAttachment: (value) =>
          insert("attachment", value, () => assertAttachmentIntegrity(read, value)),
        updateWorkspace: async (value) => {
          assertWorkspaceTopologyUnchanged(
            await required(read.getWorkspace(value.id), value.id),
            value,
          );
          await assertWorkspaceIntegrity(read, value);
          stage("workspace", value);
        },
        updateActor: async (value) => {
          assertActorIdentityUnchanged(await required(read.getActor(value.id), value.id), value);
          await assertActorIntegrity(read, value);
          stage("actor", value);
        },
        updateModelConfig: async (value) => {
          assertModelConfigIdentityUnchanged(
            await required(read.getModelConfig(value.id), value.id),
            value,
          );
          await assertModelConfigIntegrity(read, value);
          stage("model", value);
        },
        updateAgentConfig: async (value) => {
          assertAgentConfigIdentityUnchanged(
            await required(read.getAgentConfig(value.actorId), value.actorId),
            value,
          );
          await assertAgentConfigIntegrity(read, value);
          stage("agent", value);
        },
        updateMembership: async (value) => {
          const previous = (await read.listMembershipsForActor(value.actorId)).find(
            (item) => item.id === value.id,
          );
          assertMembershipIdentityUnchanged(
            await required(Promise.resolve(previous ?? null), value.id),
            value,
          );
          await assertMembershipIntegrity(read, value);
          stage("membership", value);
        },
        deleteModelConfig: async (id) => {
          await required(read.getModelConfig(id), id);
          const used = await readAll(() =>
            this.db.catalog_objects!.withIndex("by_model", (range) =>
              range.eq("kind", "agent").eq("model", id),
            ),
          );
          const pendingUsage = [...changes.values()].some(
            (change) =>
              change.kind === "agent" && (change.value as AgentConfig | null)?.modelConfigId === id,
          );
          if (
            pendingUsage ||
            used.some((row) => {
              const pending = changes.get(address("agent", row.key as string));
              return !pending || (pending.value as AgentConfig | null)?.modelConfigId === id;
            })
          )
            throw resourceConflict("ModelConfig is used by an Agent.");
          stage("model", null, id);
        },
        revokeAttachment: async (id, actorId, stamp) => {
          const value = await required(read.getAttachment(id), id);
          await assertAttachmentRevocation(read, value, actorId);
          if (value.revokedAt === undefined)
            stage("attachment", { ...value, revokedAt: stamp, revokedBy: actorId });
        },
      };
      try {
        const result = await work(tx);
        open = false;
        for (const change of changes.values()) {
          const previous = await this.native(change.kind, change.key);
          if (!change.value) {
            if (previous) await this.db.catalog_objects!.delete(previous.id);
            continue;
          }
          const value = change.value as unknown as Record<string, unknown>;
          const data = {
            kind: change.kind,
            key: change.key,
            payload: JSON.stringify(change.value),
            workspace: value.workspaceId ?? "",
            root: value.rootId ?? "",
            parent: value.parentId ?? "",
            origin: value.originId ?? "",
            actor: value.actorId ?? "",
            target: value.targetId ?? "",
            model: value.modelConfigId ?? "",
          };
          if (previous) await this.db.catalog_objects!.update(previous.id, data);
          else await this.db.catalog_objects!.insert(data);
        }
        return result;
      } finally {
        open = false;
      }
    });
    this.pending = run.catch(() => undefined);
    return run;
  }

  getWorkspace: CatalogReader["getWorkspace"] = (id) => this.reader.getWorkspace(id);
  listRootWorkspaces: CatalogReader["listRootWorkspaces"] = () => this.reader.listRootWorkspaces();
  listChildWorkspaces: CatalogReader["listChildWorkspaces"] = (id) =>
    this.reader.listChildWorkspaces(id);
  listWorkspacesByRoot: CatalogReader["listWorkspacesByRoot"] = (id) =>
    this.reader.listWorkspacesByRoot(id);
  getActor: CatalogReader["getActor"] = (id) => this.reader.getActor(id);
  listActorsByOrigin: CatalogReader["listActorsByOrigin"] = (id) =>
    this.reader.listActorsByOrigin(id);
  listActorsByRoot: CatalogReader["listActorsByRoot"] = (id) => this.reader.listActorsByRoot(id);
  getModelConfig: CatalogReader["getModelConfig"] = (id) => this.reader.getModelConfig(id);
  listModelConfigs: CatalogReader["listModelConfigs"] = (id) => this.reader.listModelConfigs(id);
  getAgentConfig: CatalogReader["getAgentConfig"] = (id) => this.reader.getAgentConfig(id);
  listMembers: CatalogReader["listMembers"] = (id) => this.reader.listMembers(id);
  queryMembers: CatalogReader["queryMembers"] = (id, query) => this.reader.queryMembers(id, query);
  getMembership: CatalogReader["getMembership"] = (actor, workspace) =>
    this.reader.getMembership(actor, workspace);
  listMembershipsForActor: CatalogReader["listMembershipsForActor"] = (id) =>
    this.reader.listMembershipsForActor(id);
  listMembershipsForWorkspace: CatalogReader["listMembershipsForWorkspace"] = (id) =>
    this.reader.listMembershipsForWorkspace(id);
  getAttachment: CatalogReader["getAttachment"] = (id) => this.reader.getAttachment(id);
  getAttachmentBySource: CatalogReader["getAttachmentBySource"] = (target, source) =>
    this.reader.getAttachmentBySource(target, source);
  listAttachmentsTo: CatalogReader["listAttachmentsTo"] = (id) => this.reader.listAttachmentsTo(id);
  listAttachmentsFrom: CatalogReader["listAttachmentsFrom"] = (id) =>
    this.reader.listAttachmentsFrom(id);
}
