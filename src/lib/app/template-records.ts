import type { WorkspaceClient } from "@jthum/framework/client";
import type { AppTemplate } from "./templates/index.ts";

interface TemplateRecordClients {
  readonly spaceClient: WorkspaceClient;
  readonly appClient: WorkspaceClient;
}

/** Seed host-owned example data without making records part of the portable Spec. */
export async function seedTemplateRecords(
  clients: TemplateRecordClients,
  sample: AppTemplate,
): Promise<void> {
  if (!sample.records?.length) return;
  const shared = new Set((sample.sharedCollections ?? []).map((type) => type.key));
  const localTypes = [
    ...new Set(sample.records.map((row) => row.type).filter((key) => !shared.has(key))),
  ];
  if (
    (await Promise.all(localTypes.map((type) => clients.appClient.listRecords(type)))).some(
      (records) => records.length,
    )
  )
    return;

  const aliases: Record<string, string> = {};
  for (const row of sample.records) {
    const client = shared.has(row.type) ? clients.spaceClient : clients.appClient;
    const values = Object.fromEntries(
      Object.entries(row.values).map(([field, value]) => [
        field,
        typeof value === "string" && value.startsWith("$")
          ? (aliases[value.slice(1)] ?? value)
          : value,
      ]),
    );
    if (shared.has(row.type) && typeof values.name === "string") {
      const existing = (await client.listRecords(row.type)).find(
        (record) => record.values.name === values.name,
      );
      if (existing) {
        if (row.as) aliases[row.as] = existing.id;
        continue;
      }
    }
    const record = await client.createRecord(row.type, values as never);
    if (row.as) aliases[row.as] = record.id;
  }
}
