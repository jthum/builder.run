import { runtimePersistenceContract } from "../../storage.contract-test.ts";
import { createNodeGateway } from "./node-gateway.ts";
import { SqlitePersistence } from "./persistence.ts";

runtimePersistenceContract("SQLite", () => new SqlitePersistence(createNodeGateway()));
