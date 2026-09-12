import { CATALOG_DATABASE, SqliteCatalogRepository } from "./catalog.ts";
import type { CatalogRepository, RuntimePersistence, RuntimeStore } from "../../storage.ts";
import type { PersistenceBackend } from "./browser-storage.ts";
import { SqliteEngine } from "./engine.ts";
import { openSqlGateway, type SqlGateway } from "./gateway.ts";
import { SqliteRuntimeStore } from "./store.ts";

export class SqlitePersistence implements RuntimePersistence {
  readonly kind = "sqlite";

  constructor(private readonly gateway: SqlGateway) {}

  static async open(): Promise<SqlitePersistence> {
    return new SqlitePersistence(await openSqlGateway());
  }

  get backend(): PersistenceBackend {
    return this.gateway.backend;
  }

  async openCatalog(): Promise<CatalogRepository> {
    return new SqliteCatalogRepository(await this.gateway.open(CATALOG_DATABASE));
  }

  async openStore(ownerId: string): Promise<RuntimeStore> {
    const name = `space-${ownerId}`;
    const connection = await this.gateway.open(name);
    return new SqliteRuntimeStore(new SqliteEngine(connection, name));
  }

  wipe(): Promise<void> {
    return this.gateway.wipe();
  }
}
