import { describe, expect, it } from "vite-plus/test";
import { Kernel, LOCAL_BROWSER_ENVIRONMENT } from "@jthum/framework/kernel";
import { createWorkspaceClient } from "@jthum/framework/client";
import { createKernelSqlitePersistence } from "./sqlite.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { installApprovalExample } from "./approval-example.ts";
import {
  ruleDraftFromDefinition,
  ruleDefinitionFromDraft,
} from "@jthum/framework/svelte/authoring/adapters";

describe("Framework approval UI contract", () => {
  it.each([true, false])(
    "survives reopen and records the %s decision through the context-bound client",
    async (approved) => {
      expect.hasAssertions();
      const gateway = createNodeGateway();
      const persistence = createKernelSqlitePersistence(gateway);
      const options = {
        persistence,
        environment: { ...LOCAL_BROWSER_ENVIRONMENT, durableRuleExecution: true },
      };
      let kernel = await Kernel.open(options);
      try {
        const root = await kernel.createRootWorkspace({ name: "Space", user: { name: "Jane" } });
        const context = { workspaceId: root.workspace.id, actorId: root.user.id };
        let client = await createWorkspaceClient(kernel, context);
        if (approved) {
          const workspace = await client.getWorkspace();
          await client.applySpec({
            ...workspace.spec,
            rules: [
              {
                id: "existing-rule",
                key: "approval_example",
                label: "Existing workflow",
                steps: [],
              },
            ],
          });
        }
        const rule = await installApprovalExample(client);
        expect(rule.key).toBe(approved ? "approval_example_2" : "approval_example");
        expect((await installApprovalExample(client)).id).toBe(rule.id);
        const workspace = await client.getWorkspace();
        const draft = ruleDraftFromDefinition(rule, workspace.spec);
        const wait = draft.steps.find((step) => "wait" in step);
        if (!wait || !("wait" in wait) || !wait.wait.request)
          throw new Error("Missing request step");
        wait.wait.request.label = "Review the laptop request";
        const authored = ruleDefinitionFromDraft(draft, workspace.spec);
        await client.applySpec({
          ...workspace.spec,
          rules: workspace.spec.rules.map((item) => (item.id === authored.id ? authored : item)),
        });
        await expect(client.startRule(rule.key, { input: {} })).rejects.toMatchObject({
          code: "VALIDATION.INVALID_INPUT",
        });
        const paused = await client.startRule(rule.key, { input: { request: "New laptop" } });
        expect(paused.status).toBe("waiting");
        expect(paused).not.toHaveProperty("checkpoint");
        expect(paused.vars?.request).toBe("New laptop");
        const agent = await kernel.createAgent(context, {
          name: "Agent",
          instructions: "Review requests.",
          provider: "test",
          model: "test",
          permissions: ["read"],
          tools: { include: [], search: false },
        });
        const agentClient = await createWorkspaceClient(kernel, {
          ...context,
          actorId: agent.actor.id,
        });
        expect(await agentClient.listRuleExecutions()).toEqual([]);
        await expect(agentClient.getRuleExecutionDetails(paused.id)).rejects.toMatchObject({
          code: "PERMISSION.DENIED",
        });
        expect(await agentClient.listActorRequests(paused.id)).toEqual([]);
        await kernel.close();
        kernel = await Kernel.open(options);
        client = await createWorkspaceClient(kernel, context);
        expect((await client.listRuleExecutions()).map((run) => run.id)).toEqual([paused.id]);
        const [request] = await client.listActorRequests(paused.id);
        expect(request?.label).toBe("Review the laptop request");
        await expect(
          client.respondToActorRequest(paused.id, request!.id, {}),
        ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
        await client.respondToActorRequest(paused.id, request!.id, { approved, note: "Reviewed" });
        const completed = await client.getRuleExecutionDetails(paused.id);
        expect(completed?.status).toBe("completed");
        expect(completed?.actorId).toBe(root.user.id);
        expect(completed?.vars?.outcome).toBe(approved ? "approved" : "declined");
        expect((await client.listActorRequests(paused.id))[0]?.status).toBe("responded");
        expect(await client.listRuleExecutions(1, 1)).toEqual([]);
        await expect(client.listRuleExecutions(0)).rejects.toThrow("pagination");
        expect(await client.listRules()).toHaveLength(approved ? 2 : 1);
      } finally {
        await kernel.close();
        await gateway.wipe();
      }
    },
  );
});
