import { ERROR_CODES, FrameworkError, resourceConflict } from "@jthum/framework/errors";
import {
  prepareCreateValues,
  type Workspace,
  type ScopeConfig,
  type ScopeHandle,
} from "@jthum/framework/kernel";
import type {
  PersistenceAdapter,
  PersistenceSession,
  CollectionSeed,
} from "@jthum/framework/persistence";
import type { Deployment, ZeroDatabase } from "./model.ts";
import { ZeroCatalogRepository } from "./catalog.ts";
import { ZeroExecutionStore } from "./executions.ts";
import { ZeroSubscriptionStore } from "./subscriptions.ts";
import { ZeroRecordStore } from "./records.ts";
import { ZeroWorkspaceConfigStore, ZeroScopeStore } from "./configuration.ts";

const unsupported = (message: string) =>
  new FrameworkError({ code: ERROR_CODES.persistenceUnsupported, message });

/** Request-bound adapter. The native endpoint owns commit/rollback; no process-local DB is opened. */
export class ZeroPersistenceAdapter implements PersistenceAdapter {
  readonly kind = "spacefast-zero";
  constructor(
    private readonly db: ZeroDatabase,
    private readonly deployment: Deployment,
  ) {}
  async open(): Promise<PersistenceSession> {
    const catalog = new ZeroCatalogRepository(this.db);
    const records = new ZeroRecordStore(this.db, this.deployment);
    const scopes = new ZeroScopeStore(this.db, this.deployment.workspaceId);
    const subscriptions = new ZeroSubscriptionStore(this.db);
    const executions = new ZeroExecutionStore(this.db);
    const workspaceConfigs = new ZeroWorkspaceConfigStore(this.db, this.deployment.workspaceId);
    const preflight = async (workspaceId: string, seeds: readonly CollectionSeed[]) => {
      const seen = new Set<string>();
      for (const seed of seeds)
        for (const record of seed.records) {
          prepareCreateValues(seed.collection, record.values);
          const key = JSON.stringify([seed.collection.id, record.id]);
          if (seen.has(key) || (await records.get(workspaceId, seed.collection, record.id)))
            throw resourceConflict("Initial records must have unused identities.");
          seen.add(key);
        }
    };
    const insertSeeds = async (workspaceId: string, seeds: readonly CollectionSeed[]) => {
      for (const seed of seeds)
        for (const record of seed.records)
          await records.create(workspaceId, seed.collection, record);
    };
    const applyScope = async (
      workspace: Workspace,
      scope: ScopeHandle,
      config: ScopeConfig,
      seeds: readonly CollectionSeed[] = [],
    ) => {
      await records.applySchema(workspace.id, [
        ...workspace.spec.collections,
        ...config.collections,
      ]);
      await preflight(workspace.id, seeds);
      await scopes.set(workspace.id, scope, config);
      await subscriptions.replace(workspace.id, scope, config.rules);
      await insertSeeds(workspace.id, seeds);
    };
    return {
      catalog,
      records,
      scopes,
      subscriptions,
      executions,
      workspaceConfigs,
      modules: {
        capabilities: [],
        async open() {
          throw unsupported(
            "This generated-app target does not install host-owned domain modules.",
          );
        },
        async reset() {
          throw unsupported("No host-owned modules are installed in this deployment.");
        },
      },
      applyWorkspaceSpec: async (workspace, seeds = []) => {
        await records.applySchema(workspace.id, workspace.spec.collections);
        await preflight(workspace.id, seeds);
        await catalog.transaction((tx) => tx.updateWorkspace(workspace));
        await subscriptions.replace(workspace.id, undefined, workspace.spec.rules);
        await insertSeeds(workspace.id, seeds);
      },
      applyScopeConfig: applyScope,
      deleteScope: async (workspace, scope) => {
        const config = await scopes.get(workspace.id, scope);
        if (!config) return;
        for (const collection of config.collections)
          for (const record of await records.list(workspace.id, collection))
            await records.delete(workspace.id, collection, record.id);
        await subscriptions.replace(workspace.id, scope, []);
        await scopes.delete(workspace.id, scope);
      },
      deleteWorkspace: async () => {
        throw unsupported("Delete this generated app through its deployment target.");
      },
      close: async () => {},
    };
  }
}
