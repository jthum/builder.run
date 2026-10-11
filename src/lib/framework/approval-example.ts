import type { WorkspaceClient } from "@jthum/framework/client";
import type { RuleDefinition } from "@jthum/framework/spec";
import { createSpecId } from "$lib/runtime/ids.ts";

/** Explicit example installation; never modifies business records or unrelated definitions. */
export async function installApprovalExample(client: WorkspaceClient): Promise<RuleDefinition> {
  const workspace = await client.getWorkspace();
  const existing = workspace.spec.rules.find((rule) => rule.meta?.example === "durable_approval");
  if (existing) return existing;
  const id = createSpecId();
  let key = "approval_example";
  let suffix = 1;
  while (workspace.spec.rules.some((rule) => rule.key === key))
    key = `approval_example_${++suffix}`;
  const rule: RuleDefinition = {
    id,
    key,
    label: "Approval example",
    description:
      "Submit a request, leave and return, then approve or decline. This example does not change business records.",
    meta: { example: "durable_approval" },
    input: { request: { value: "text", required: true } },
    steps: [
      { id: createSpecId(), compute: { assign: { submitted: { $ref: "vars.request" } } } },
      {
        id: createSpecId(),
        wait: {
          request: {
            label: "Review the request",
            fields: [
              {
                id: createSpecId(),
                key: "approved",
                label: "Approve this request?",
                type: "boolean",
                required: true,
              },
              {
                id: createSpecId(),
                key: "note",
                label: "Review note",
                type: "text",
                description: "Optional context for your decision.",
              },
            ],
          },
          as: "review",
        },
      },
      {
        id: createSpecId(),
        gate: {
          predicate: { op: "context.equals", path: "vars.review.approved", value: true },
          pass: [{ id: createSpecId(), compute: { assign: { outcome: "approved" } } }],
          fail: [{ id: createSpecId(), compute: { assign: { outcome: "declined" } } }],
        },
      },
    ],
  };
  await client.applySpec({ ...workspace.spec, rules: [...workspace.spec.rules, rule] });
  return rule;
}
