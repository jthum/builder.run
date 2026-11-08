import { readAll } from "./page.ts";
import { ERROR_CODES, FrameworkError, resourceNotFound } from "@jthum/framework/errors";
import {
  EMPTY_WORKSPACE_CONFIG,
  type WorkspaceConfig,
  type ScopeConfig,
  type ScopeHandle,
} from "@jthum/framework/kernel";
import type { ScopeStore, WorkspaceConfigStore } from "@jthum/framework/persistence";
import type { ZeroReadDatabase, ZeroReadTable, ZeroRow, ZeroTable } from "./model.ts";

type Keys = Readonly<Record<string, string>>;

/** One instance per request/parent Zero transaction. No process-local lock substitutes for DB isolation. */
class ConfigurationTable {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly table: ZeroReadTable,
    private readonly index: string,
  ) {}

  private find(keys: Keys) {
    return this.table
      .withIndex(this.index, (range) => {
        for (const [field, value] of Object.entries(keys)) range = range.eq(field, value);
        return range;
      })
      .first();
  }

  async get<T>(keys: Keys): Promise<T | null> {
    const row = await this.find(keys);
    return row ? (JSON.parse(row.payload as string) as T) : null;
  }

  list(workspace: string) {
    return readAll(() =>
      this.table.withIndex("by_workspace", (range) => range.eq("workspace", workspace)),
    );
  }

  private writer(): ZeroTable {
    if (!("insert" in this.table))
      throw new FrameworkError({
        code: ERROR_CODES.persistenceUnsupported,
        message: "This handler is read-only.",
      });
    return this.table as ZeroTable;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.pending.then(work);
    this.pending = result.catch(() => undefined);
    return result;
  }

  update<T>(keys: Keys, change: (current: T | null) => T): Promise<T> {
    return this.enqueue(async () => {
      const previous = await this.find(keys);
      // Compute and serialize before the only write. A rejected callback leaves storage untouched.
      const payload = JSON.stringify(
        change(previous ? (JSON.parse(previous.payload as string) as T) : null),
      );
      const result = JSON.parse(payload) as T;
      if (previous) {
        if (!(await this.writer().update(previous.id, { payload })))
          throw resourceNotFound("Configuration", previous.id);
      } else await this.writer().insert({ ...keys, payload });
      return result;
    });
  }

  remove(keys: Keys): Promise<void> {
    return this.enqueue(async () => {
      const row = await this.find(keys);
      if (row) await this.writer().delete(row.id);
    });
  }
}

function workspaceKey(expected: string, actual: string): Keys {
  if (expected !== actual) throw resourceNotFound("Workspace", actual);
  return { workspace: actual };
}

export class ZeroWorkspaceConfigStore implements WorkspaceConfigStore {
  private readonly table: ConfigurationTable;
  constructor(
    db: ZeroReadDatabase,
    private readonly workspaceId: string,
  ) {
    this.table = new ConfigurationTable(db.workspace_config!, "by_workspace");
  }
  async get(workspaceId: string): Promise<WorkspaceConfig> {
    const value = await this.table.get<WorkspaceConfig>(
      workspaceKey(this.workspaceId, workspaceId),
    );
    // These contracts contain JSON data, including already-sealed secrets; no crypto is performed here.
    return value ?? (JSON.parse(JSON.stringify(EMPTY_WORKSPACE_CONFIG)) as WorkspaceConfig);
  }
  async update(
    workspaceId: string,
    change: (current: WorkspaceConfig) => WorkspaceConfig,
  ): Promise<WorkspaceConfig> {
    const keys = workspaceKey(this.workspaceId, workspaceId);
    return this.table.update<WorkspaceConfig>(keys, (current) =>
      change(current ?? (JSON.parse(JSON.stringify(EMPTY_WORKSPACE_CONFIG)) as WorkspaceConfig)),
    );
  }
}

export class ZeroScopeStore implements ScopeStore {
  private readonly table: ConfigurationTable;
  constructor(
    db: ZeroReadDatabase,
    private readonly workspaceId: string,
  ) {
    this.table = new ConfigurationTable(db.scope_config!, "by_scope");
  }
  private keys(workspaceId: string, scope: ScopeHandle): Keys {
    return {
      ...workspaceKey(this.workspaceId, workspaceId),
      scope_kind: scope.kind,
      scope_id: scope.id,
    };
  }
  async get(workspaceId: string, scope: ScopeHandle): Promise<ScopeConfig | null> {
    return this.table.get(this.keys(workspaceId, scope));
  }
  async list(workspaceId: string) {
    workspaceKey(this.workspaceId, workspaceId);
    const rows: ZeroRow[] = await this.table.list(workspaceId);
    return rows.map((row) => ({
      workspaceId,
      scope: { kind: row.scope_kind as string, id: row.scope_id as string },
      config: JSON.parse(row.payload as string) as ScopeConfig,
    }));
  }
  async set(workspaceId: string, scope: ScopeHandle, config: ScopeConfig): Promise<void> {
    await this.table.update<ScopeConfig>(this.keys(workspaceId, scope), () => config);
  }
  async delete(workspaceId: string, scope: ScopeHandle): Promise<void> {
    return this.table.remove(this.keys(workspaceId, scope));
  }
}
