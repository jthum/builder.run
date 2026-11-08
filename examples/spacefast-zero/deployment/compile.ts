import { createHash } from "node:crypto";
import { assertValidSpec, type Spec } from "@jthum/framework/spec";
import type { Deployment, QueryPlan } from "./model.ts";
import { queryShape } from "./query-shape.ts";

// Instance configuration is JSON metadata; record fields retain their native storage mapping.
const configurationSchema = `
auth_links: table({subject: string(), actor: string()}).index("by_subject", ["subject"]),
runtime_state: table({key: string(), sequence: number()}).index("by_key", ["key"]),
execution_bodies: table({workspace: string(), key: string(), payload: string()}).index("by_identity", ["workspace", "key"]),
execution_headers: table({workspace: string(), key: string(), actor: string(), scope_kind: string(), scope_id: string(), created: string(), active: boolean(), payload: string()})
  .index("by_identity", ["workspace", "key"]).index("by_actor", ["workspace", "actor", "created", "key"])
  .index("by_scope", ["workspace", "scope_kind", "scope_id", "active"]),
actor_requests: table({workspace: string(), key: string(), execution: string(), actor: string(), status: string(), created: string(), payload: string()})
  .index("by_identity", ["workspace", "key"]).index("by_execution", ["workspace", "execution"])
  .index("by_actor", ["workspace", "actor", "status", "created", "key"]),
rule_subscriptions: table({workspace: string(), scope_kind: string(), scope_id: string(), event: string(), rule: string()})
  .index("by_workspace", ["workspace"]).index("by_scope", ["workspace", "scope_kind", "scope_id"])
  .index("by_event", ["workspace", "scope_kind", "scope_id", "event"]),
catalog_objects: table({kind: string(), key: string(), payload: string(), workspace: string(),
  root: string(), parent: string(), origin: string(), actor: string(), target: string(), model: string()})
  .index("by_identity", ["kind", "key"])
  .index("by_workspace", ["kind", "workspace"]).index("by_root", ["kind", "root"])
  .index("by_parent", ["kind", "parent"]).index("by_origin", ["kind", "origin"])
  .index("by_actor", ["kind", "actor"]).index("by_target", ["kind", "target"])
  .index("by_model", ["kind", "model"]),
workspace_config: table({workspace: string(), payload: string()}).index("by_workspace", ["workspace"]),
scope_config: table({workspace: string(), scope_kind: string(), scope_id: string(), payload: string()})
  .index("by_scope", ["workspace", "scope_kind", "scope_id"])
  .index("by_workspace", ["workspace"])
`;

/** Physical names depend on stable identity, never the editable label/key. */
const name = (prefix: string, id: string) =>
  `${prefix}_${createHash("sha256").update(id).digest("hex").slice(0, 24)}`;

export function compileDeployment(
  spec: Spec,
  workspaceId: string,
): {
  deployment: Deployment;
  schema: string;
} {
  assertValidSpec(spec);
  const tables = new Set<string>();
  const collections = spec.collections.map((definition) => {
    const table = name("collection", definition.id);
    if (tables.has(table)) throw new Error("Physical table collision.");
    tables.add(table);
    const fields = definition.fields.map((field) => ({
      id: field.id,
      column: name("field", field.id),
      storage:
        field.type === "number"
          ? ("number" as const)
          : field.type === "boolean"
            ? ("boolean" as const)
            : ("string" as const),
      json:
        field.type === "json" ||
        ((field.type === "reference" || field.type === "choice") && !!field.multiple),
    }));
    if (new Set(fields.map((field) => field.column)).size !== fields.length)
      throw new Error("Physical column collision.");
    const plans: QueryPlan[] = [];
    const queries = [
      {},
      ...spec.views
        .filter((view) => view.source === definition.key)
        .map((view) => view.query ?? {}),
    ];
    for (const query of queries) {
      // Unsupported Views remain portable; report their limits rather than silently change them.
      const shape = queryShape(query);
      if (shape === undefined) continue;
      if (plans.some((plan) => plan.shape === shape)) continue;
      const filter = query.filter && "path" in query.filter ? query.filter : undefined;
      const sortId = query.sort?.[0]?.path[0];
      const filterId = filter?.path[0];
      const column = (id: string) => {
        const field = fields.find((item) => item.id === id);
        if (!field || field.json) throw new Error("An indexed Field must be scalar.");
        return field.column;
      };
      if (filterId && sortId && filter!.operator !== "eq" && filterId !== sortId) continue;
      const columns = [
        "fw_workspace",
        ...(filterId ? [column(filterId)] : []),
        ...(sortId ? [column(sortId)] : ["fw_created"]),
        "fw_id",
      ];
      plans.push({ shape, index: name("query", shape), columns: [...new Set(columns)] });
    }
    return { definition, table, fields, plans };
  });
  const recordSchema = collections
    .map((collection) => {
      const columns = [
        "fw_workspace: string()",
        "fw_id: string()",
        "fw_created: string()",
        "fw_updated: string()",
        "fw_creator: string()",
        "fw_editor: string()",
        "fw_nulls: string()",
        ...collection.fields.map((field) => `${field.column}: ${field.storage}().optional()`),
      ];
      return (
        `${collection.table}: table({${columns.join(",")}})` +
        `.index("by_identity", ["fw_workspace", "fw_id"])` +
        collection.plans
          .map((plan) => `.index(${JSON.stringify(plan.index)}, ${JSON.stringify(plan.columns)})`)
          .join("")
      );
    })
    .join(",\n");
  const schema = [configurationSchema, recordSchema].filter(Boolean).join(",\n");
  return { deployment: { spec, workspaceId, collections }, schema };
}
