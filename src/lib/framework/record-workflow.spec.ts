import { describe, expect, it } from "vite-plus/test";
import { Kernel, LOCAL_BROWSER_ENVIRONMENT } from "@jthum/framework/kernel";
import { createWorkspaceClient } from "@jthum/framework/client";
import { createEmptySpec } from "@jthum/framework/spec";
import {
  ruleDefinitionFromDraft,
  ruleDraftFromDefinition,
  type RuleDraft,
} from "@jthum/framework/svelte/studio/adapters";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { createKernelSqlitePersistence } from "./sqlite.ts";

describe("Canonical record workflow cutover", () => {
  it.each([true, false])(
    "authors, pauses, reopens, and applies a %s decision to the original record",
    async (approved) => {
      expect.hasAssertions();
      const gateway = createNodeGateway();
      const options = {
        persistence: createKernelSqlitePersistence(gateway),
        environment: { ...LOCAL_BROWSER_ENVIRONMENT, durableRuleExecution: true },
      };
      let kernel = await Kernel.open(options);
      try {
        const root = await kernel.createRootWorkspace({ name: "Space", user: { name: "Jane" } });
        const child = await kernel.createWorkspace(
          { workspaceId: root.workspace.id, actorId: root.user.id },
          { name: "Expenses" },
        );
        const context = { workspaceId: child.workspace.id, actorId: root.user.id };
        let client = await createWorkspaceClient(kernel, context);
        const empty = createEmptySpec({ id: "expenses-spec", key: "expenses", label: "Expenses" });
        const base = {
          ...empty,
          collections: [
            {
              id: "expenses",
              key: "expense",
              label: "Expense",
              fields: [
                {
                  id: "amount",
                  key: "amount",
                  label: "Amount",
                  type: "number" as const,
                  required: true,
                },
                {
                  id: "status",
                  key: "status",
                  label: "Status",
                  type: "text" as const,
                  default: "draft",
                },
                {
                  id: "reviewed",
                  key: "reviewed",
                  label: "Reviewed",
                  type: "boolean" as const,
                  default: false,
                },
              ],
            },
          ],
        };
        const approval: RuleDraft = {
          id: "review-rule",
          key: "review",
          label: "Review expense",
          input: { expense: { record: "expense" } },
          steps: [
            {
              id: "ask",
              wait: {
                request: {
                  label: "Approve this expense?",
                  fields: [
                    {
                      id: "approved",
                      key: "approved",
                      label: "Approve?",
                      type: "boolean",
                      required: true,
                    },
                  ],
                },
                as: "response",
              },
            },
            {
              id: "decision",
              gate: {
                predicate: { op: "context.equals", path: "vars.response.approved", value: true },
                pass: [
                  {
                    id: "approve",
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.expense" }, values: { status: "approved" } },
                    },
                  },
                ],
                fail: [
                  {
                    id: "decline",
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.expense" }, values: { status: "declined" } },
                    },
                  },
                ],
              },
            },
          ],
        };
        const canonical = ruleDefinitionFromDraft(approval, base);
        expect(ruleDefinitionFromDraft(ruleDraftFromDefinition(canonical, base), base)).toEqual(
          canonical,
        );
        const audit: RuleDraft = {
          id: "audit-rule",
          key: "audit",
          label: "Mark reviewed",
          input: { expense: { record: "expense" } },
          trigger: { key: "expense.status.changed" },
          steps: [
            {
              id: "reviewed-step",
              effect: {
                key: "records.set",
                params: { record: { $ref: "vars.expense" }, values: { reviewed: true } },
              },
            },
          ],
        };
        await client.applySpec({
          ...base,
          rules: [canonical, ruleDefinitionFromDraft(audit, base)],
        });
        const created = await client.executeAction("records.create", {
          sourceId: "expenses",
          values: { amount: 100 },
        });
        if (
          !created ||
          typeof created !== "object" ||
          Array.isArray(created) ||
          typeof created.id !== "string"
        )
          throw new Error("Expected a created record");
        const paused = await client.startRule("review", { input: { expense: created.id } });
        expect(paused.status).toBe("waiting");
        expect((await client.getRecord("expense", created.id))?.values).toEqual({
          amount: 100,
          status: "draft",
          reviewed: false,
        });
        await kernel.close();
        kernel = await Kernel.open(options);
        client = await createWorkspaceClient(kernel, context);
        const [request] = await client.listActorRequests(paused.id);
        expect(request?.actorId).toBe(root.user.id);
        await client.respondToActorRequest(paused.id, request!.id, { approved });
        expect((await client.getRuleExecutionDetails(paused.id))?.status).toBe("completed");
        expect((await client.getRecord("expense", created.id))?.values).toEqual({
          amount: 100,
          status: approved ? "approved" : "declined",
          reviewed: true,
        });
        expect((await client.getRecord("expense", created.id))?.updatedBy).toBe(root.user.id);
        expect(await client.listRecords("expense")).toHaveLength(1);
        const spaceClient = await createWorkspaceClient(kernel, {
          ...context,
          workspaceId: root.workspace.id,
        });
        expect(await spaceClient.listRuleExecutions()).toEqual([]);
      } finally {
        await kernel.close();
        await gateway.wipe();
      }
    },
  );
});
