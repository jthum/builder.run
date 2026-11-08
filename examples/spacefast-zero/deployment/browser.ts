import { canonicalJson } from "@spacefast/common/utils/canonical-json";
import type {
  ZeroDatabase,
  ZeroRuntimeFinalizePayload,
  ZeroMigrationPlan,
} from "@spacefast/common/contracts/zero";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Spec } from "@jthum/framework/spec";
import { compileDeployment } from "./compile.ts";

export interface BrowserTemplate {
  format: 1;
  sdkVersion: "0.8.0";
  payload: ZeroRuntimeFinalizePayload;
  sources: { path: string; source: string }[];
  files: { path: string; contentType: string; base64: string }[];
}
export interface DeploymentFile {
  path: string;
  contentType: string;
  bytes: Uint8Array;
}
const encoder = new TextEncoder();
const hash = (value: string | Uint8Array) =>
  bytesToHex(sha256(typeof value === "string" ? encoder.encode(value) : value));
const digest = (value: unknown) => `sha256:${hash(canonicalJson(value))}`;
const decode = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const encode = (bytes: Uint8Array) => {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 16384)
    result += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(result);
};

/** Match the pinned SDK's deploy identity; static bytes have their own manifest hashes. */
export function deployDigest(payload: ZeroRuntimeFinalizePayload) {
  const { entries, files, env } = payload.artifact.sourceManifest;
  const executable = (
    source: (typeof payload.endpointSources)[number] | (typeof payload.runSources)[number],
  ) => {
    const { db, ...metadata } = source;
    if (!db) return metadata;
    const { migrationOperations: _, ...stableDb } = db;
    return { ...metadata, db: stableDb };
  };
  return digest({
    artifact: { ...payload.artifact, sourceManifest: { entries, files, env } },
    bundles: payload.bundles.map(({ path, sha256, size }) => ({ path, sha256, size })),
    endpointSources: payload.endpointSources.map(executable),
    runSources: payload.runSources.map(executable),
    install: payload.install,
    variables: payload.variables,
    realtime: payload.realtime,
    auth: payload.auth,
    inspect: payload.inspect,
    schemaHash: payload.migrations?.schemaHash ?? null,
  });
}

/** Retain physical data when portable definitions are removed. Destructive conversions fail. */
function retainedSchema(previous: ZeroDatabase, next: ZeroDatabase): ZeroDatabase {
  const result = structuredClone(previous);
  for (const [name, table] of Object.entries(next)) {
    const prior = previous[name];
    const columns = new Map(prior?.columns.map((column) => [column.name, column]));
    const indexes = new Map(prior?.indexes.map((index) => [index.name, index]));
    for (const column of table.columns) {
      const before = columns.get(column.name);
      if (before && (before.type !== column.type || (before.nullable && !column.nullable)))
        throw new Error(
          `Spacefast cannot change storage for ${name}.${column.name} without an explicit data conversion.`,
        );
      columns.set(column.name, column);
    }
    for (const index of table.indexes) {
      const before = indexes.get(index.name);
      if (
        before &&
        canonicalJson([before.fields, before.unique ?? false]) !==
          canonicalJson([index.fields, index.unique ?? false])
      )
        throw new Error(`Spacefast index ${name}.${index.name} changed incompatibly.`);
      indexes.set(index.name, index);
    }
    result[name] = { ...table, columns: [...columns.values()], indexes: [...indexes.values()] };
  }
  return result;
}

function migrations(previous: ZeroDatabase, next: ZeroDatabase): ZeroMigrationPlan {
  const operations: ZeroMigrationPlan["operations"] = [];
  for (const [name, table] of Object.entries(next).sort(([a], [b]) => a.localeCompare(b))) {
    const before = previous[name];
    if (!before) operations.push({ op: "create_table", table: name });
    for (const column of table.columns)
      if (!before?.columns.some((item) => item.name === column.name))
        operations.push({ op: "add_column", table: name, column });
    for (const index of table.indexes)
      if (!before?.indexes.some((item) => item.name === index.name))
        operations.push({
          op: "add_index",
          table: name,
          name: index.name,
          columns: index.fields,
          unique: index.unique ?? false,
        });
  }
  return {
    format: "stattic.zero.migrations.v1",
    mode: "safe",
    schemaHash: digest(next),
    operations,
  };
}

/** All per-app compilation runs locally over an SDK-compiled, versioned runtime template. */
export function prepareBrowserDeployment(
  template: BrowserTemplate,
  spec: Spec,
  previous: ZeroDatabase = {},
  releaseId = crypto.randomUUID().replaceAll("-", ""),
) {
  if (template.format !== 1 || template.sdkVersion !== "0.8.0")
    throw new Error("Unsupported Spacefast template version. Rebuild the deployment assets.");
  const { deployment } = compileDeployment(spec, "deployed-app");
  const payload = structuredClone(template.payload);
  const schema: ZeroDatabase = { ...payload.artifact.server.schema };
  for (const collection of deployment.collections)
    schema[collection.table] = {
      name: collection.table,
      columns: [
        ...[
          "fw_workspace",
          "fw_id",
          "fw_created",
          "fw_updated",
          "fw_creator",
          "fw_editor",
          "fw_nulls",
        ].map((name) => ({ name, type: "string" as const, nullable: false })),
        ...collection.fields.map((field) => ({
          name: field.column,
          type: field.storage,
          nullable: true,
          optional: true as const,
        })),
      ],
      indexes: [
        { name: "by_identity", fields: ["fw_workspace", "fw_id"] },
        ...collection.plans.map((plan) => ({ name: plan.index, fields: [...plan.columns] })),
      ],
    };
  const next = retainedSchema(previous, schema);
  const plan = migrations(previous, next);
  const identifier = (name: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      throw new Error(`Unsupported native identifier: ${name}`);
    return name;
  };
  const schemaSource =
    "{" +
    Object.entries(next)
      .map(
        ([name, table]) =>
          `${identifier(name)}:table({${table.columns
            .map((column) => {
              if (!["string", "number", "boolean"].includes(column.type))
                throw new Error(`Unsupported retained Spacefast column type: ${column.type}`);
              return `${identifier(column.name)}:${column.type}()${column.nullable ? ".optional()" : ""}`;
            })
            .join(
              ",",
            )}})${table.indexes.map((index) => `.index(${JSON.stringify(index.name)},${JSON.stringify(index.fields)})`).join("")}`,
      )
      .join(",") +
    "}";
  const replacements: Record<string, string> = {
    '"__SF_DEPLOYMENT_JSON__"': JSON.stringify(JSON.stringify(deployment)),
    '"__SF_RELEASE_ID__"': JSON.stringify(releaseId),
    __SF_SCHEMA_SOURCE__: schemaSource,
  };
  const fill = (source: string) =>
    source.replace(
      /"__SF_DEPLOYMENT_JSON__"|"__SF_RELEASE_ID__"|__SF_SCHEMA_SOURCE__/g,
      (token) => replacements[token]!,
    );
  const sources = template.sources.map((file) => ({ path: file.path, source: fill(file.source) }));
  payload.artifact.server.schema = next;
  payload.artifact.sourceManifest = {
    ...payload.artifact.sourceManifest,
    sourceRoot: ".",
    files: sources.map((file) => {
      const bytes = encoder.encode(file.source);
      return { path: file.path, size: bytes.length, sha256: hash(bytes) };
    }),
  };
  payload.migrations = plan;
  const db = {
    schemaHash: plan.schemaHash,
    migrationOperations: plan.operations,
    tables: Object.fromEntries(
      Object.entries(next).map(([name, table]) => [
        name,
        {
          primaryKey: "id",
          columns: Object.fromEntries([
            ...["id", "createdAt", "updatedAt"].map((name) => [
              name,
              { physicalName: name, type: name === "id" ? "id" : "string" },
            ]),
            ...table.columns.map((column) => [
              column.name,
              {
                physicalName: column.name,
                type: column.type,
                nullable: column.nullable,
                ...(column.optional ? { optional: true } : {}),
              },
            ]),
          ]),
          indexes: Object.fromEntries(
            table.indexes.map((index) => [index.name, { fields: index.fields }]),
          ),
        },
      ]),
    ),
  };
  for (const bundle of payload.bundles) {
    const bytes = encoder.encode(fill(new TextDecoder().decode(decode(bundle.contentBase64))));
    bundle.contentBase64 = encode(bytes);
    bundle.size = bytes.length;
    bundle.sha256 = `sha256:${hash(bytes)}`;
  }
  for (const endpoint of payload.endpointSources) {
    endpoint.source = fill(endpoint.source);
    endpoint.schemaHash = plan.schemaHash;
    endpoint.db = db;
  }
  const identity = deployDigest(payload);
  const files: DeploymentFile[] = template.files.map((file) => ({
    path: file.path,
    contentType: file.contentType,
    bytes: decode(file.base64),
  }));
  files.push({
    path: "__spacefast/zero/deploy.json",
    contentType: "application/json",
    bytes: encoder.encode(
      JSON.stringify({ format: "spacefast.zero.deploy.v1", digest: identity }) + "\n",
    ),
  });
  return {
    files,
    sources,
    sourceMetadata: { statticZero: { finalize: payload } },
    schema: next,
    digest: identity,
  };
}
