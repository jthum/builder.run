import { readAll } from "./page.ts";
import { resourceConflict } from "@jthum/framework/errors";
import {
  assertExecutionUpdate,
  type ExecutionStore,
  type RuleExecution,
  type RuleExecutionSummary,
} from "@jthum/framework/persistence";
import type { ActorRequest, ScopeHandle } from "@jthum/framework/kernel";
import type { ZeroDatabase } from "./model.ts";
import { readPage } from "./page.ts";

export class ZeroExecutionStore implements ExecutionStore {
  constructor(private readonly db: ZeroDatabase) {}
  private row(table: string, workspace: string, key: string) {
    return this.db[table]!.withIndex("by_identity", (range) =>
      range.eq("workspace", workspace).eq("key", key),
    ).first();
  }
  async get(workspace: string, id: string): Promise<RuleExecution | null> {
    const row = await this.row("execution_bodies", workspace, id);
    return row ? (JSON.parse(row.payload as string) as RuleExecution) : null;
  }
  async getMany(workspace: string, ids: readonly string[]) {
    const result: RuleExecution[] = [];
    for (const id of new Set(ids)) {
      const value = await this.get(workspace, id);
      if (value) result.push(value);
    }
    return result;
  }
  async list(
    workspace: string,
    actor: string,
    limit: number,
    offset: number,
  ): Promise<readonly RuleExecutionSummary[]> {
    const rows = await readPage(
      () =>
        this.db
          .execution_headers!.withIndex("by_actor", (range) =>
            range.eq("workspace", workspace).eq("actor", actor),
          )
          .order("desc"),
      limit,
      offset,
    );
    return rows.map((row) => JSON.parse(row.payload as string) as RuleExecutionSummary);
  }
  async listPendingRequests(
    workspace: string,
    actor: string,
    limit: number,
    offset: number,
  ): Promise<readonly ActorRequest[]> {
    const rows = await readPage(
      () =>
        this.db
          .actor_requests!.withIndex("by_actor", (range) =>
            range.eq("workspace", workspace).eq("actor", actor).eq("status", "pending"),
          )
          .order("desc"),
      limit,
      offset,
    );
    return rows.map((row) => JSON.parse(row.payload as string) as ActorRequest);
  }
  async hasActiveScope(workspace: string, scope: ScopeHandle): Promise<boolean> {
    return !!(await this.db
      .execution_headers!.withIndex("by_scope", (range) =>
        range
          .eq("workspace", workspace)
          .eq("scope_kind", scope.kind)
          .eq("scope_id", scope.id)
          .eq("active", true),
      )
      .first());
  }
  async create(execution: RuleExecution): Promise<void> {
    if (execution.revision !== 0 || (await this.get(execution.context.workspaceId, execution.id)))
      throw resourceConflict("New executions require revision zero and a unique identity.");
    await this.save(execution);
  }
  async update(execution: RuleExecution, expectedRevision: number): Promise<void> {
    assertExecutionUpdate(
      await this.get(execution.context.workspaceId, execution.id),
      execution,
      expectedRevision,
    );
    await this.save(execution);
  }
  private async save(execution: RuleExecution) {
    const workspace = execution.context.workspaceId;
    const scope = execution.context.scope;
    const summary: RuleExecutionSummary = {
      id: execution.id,
      actorId: execution.context.actorId,
      ...(scope ? { scope } : {}),
      rule: { id: execution.rule.id, key: execution.rule.key, label: execution.rule.label },
      status: execution.status,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    };
    for (const [table, value] of [
      ["execution_bodies", { workspace, key: execution.id, payload: JSON.stringify(execution) }],
      [
        "execution_headers",
        {
          workspace,
          key: execution.id,
          actor: execution.context.actorId,
          scope_kind: scope?.kind ?? "",
          scope_id: scope?.id ?? "",
          created: execution.createdAt,
          active: execution.status === "running" || execution.status === "waiting",
          payload: JSON.stringify(summary),
        },
      ],
    ] as const) {
      const previous = await this.row(table, workspace, execution.id);
      if (previous) await this.db[table]!.update(previous.id, value);
      else await this.db[table]!.insert(value);
    }
    const previousRequests = await readAll(() =>
      this.db.actor_requests!.withIndex("by_execution", (range) =>
        range.eq("workspace", workspace).eq("execution", execution.id),
      ),
    );
    for (const request of previousRequests) await this.db.actor_requests!.delete(request.id);
    const requests = Array.isArray(execution.checkpoint.requests)
      ? (execution.checkpoint.requests as unknown as readonly ActorRequest[])
      : [];
    for (const request of requests)
      await this.db.actor_requests!.insert({
        workspace,
        execution: execution.id,
        key: JSON.stringify([execution.id, request.id]),
        actor: request.actorId,
        status: request.status,
        created: request.createdAt,
        payload: JSON.stringify(request),
      });
  }
}
