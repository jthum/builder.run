import { readAll } from "./page.ts";
import type { RuleSubscriptionStore } from "@jthum/framework/persistence";
import type { RuleDefinition } from "@jthum/framework/spec";
import type { ScopeHandle } from "@jthum/framework/kernel";
import type { ZeroDatabase } from "./model.ts";

export class ZeroSubscriptionStore implements RuleSubscriptionStore {
  constructor(private readonly db: ZeroDatabase) {}
  async match(workspaceId: string, scope: ScopeHandle | undefined, event: string) {
    const matches = [];
    for (const selected of scope ? [undefined, scope] : [undefined]) {
      const rows = await readAll(() =>
        this.db.rule_subscriptions!.withIndex("by_event", (range) =>
          range
            .eq("workspace", workspaceId)
            .eq("scope_kind", selected?.kind ?? "")
            .eq("scope_id", selected?.id ?? "")
            .eq("event", event),
        ),
      );
      matches.push(
        ...rows.map((row) => ({
          workspaceId,
          ...(selected ? { scope: selected } : {}),
          event,
          ruleId: row.rule as string,
        })),
      );
    }
    return matches;
  }
  async replace(
    workspaceId: string,
    scope: ScopeHandle | undefined,
    rules: readonly RuleDefinition[],
  ) {
    const previous = await readAll(() =>
      this.db.rule_subscriptions!.withIndex("by_scope", (range) =>
        range
          .eq("workspace", workspaceId)
          .eq("scope_kind", scope?.kind ?? "")
          .eq("scope_id", scope?.id ?? ""),
      ),
    );
    for (const row of previous) await this.db.rule_subscriptions!.delete(row.id);
    for (const rule of rules)
      if (rule.trigger)
        await this.db.rule_subscriptions!.insert({
          workspace: workspaceId,
          scope_kind: scope?.kind ?? "",
          scope_id: scope?.id ?? "",
          event: rule.trigger.event,
          rule: rule.id,
        });
  }
  async deleteWorkspace(workspaceId: string) {
    const rows = await readAll(() =>
      this.db.rule_subscriptions!.withIndex("by_workspace", (range) =>
        range.eq("workspace", workspaceId),
      ),
    );
    for (const row of rows) await this.db.rule_subscriptions!.delete(row.id);
  }
}
