<script lang="ts">
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { session } from "$lib/app/session.svelte.ts";
  import { goto } from "$app/navigation";
  import RuleEditor from "@jthum/framework/svelte/studio/rule-editor";
  import { CORE_RULE_EFFECTS, type RuleDraft, type RuleCompatibility } from "@jthum/framework/svelte/studio/data";
  import { ruleDefinitionFromDraft } from "@jthum/framework/svelte/studio/adapters";
  import { checkRuleCompatibility, requiresDurableExecution } from "@jthum/framework/kernel";
  import type { RuntimeAction } from "@jthum/framework/kernel";
  let { workflow }: { workflow: RuleDraft } = $props();
  const context = $derived(canonicalStudio.context!);
  const actions = $derived(canonicalStudio.ruleActions());
  let runtimeActions = $state<readonly RuntimeAction[]>([]);
  $effect(() => {
    const client = session.framework?.appClient;
    const revision = session.revision;
    if (!client) { runtimeActions = []; return; }
    let active = true;
    void client.listRuntimeActions()
      .then((items) => { if (active && revision === session.revision) runtimeActions = items; })
      .catch(() => { if (active) runtimeActions = []; });
    return () => { active = false; };
  });
  function compatibility(draft: RuleDraft): RuleCompatibility {
    const runtime = session.framework;
    const spec = canonicalStudio.spec;
    if (!runtime || !spec) return { diagnostics: [] };
    try {
      const rule = ruleDefinitionFromDraft(draft, spec, canonicalStudio.schemas);
      const shortProfile = runtime.kernel.getRuleRuntimeProfile(new Set([
        "record.created", "record.updated", "record.deleted", "record.field_changed", "form.submitted",
      ]));
      const durable = requiresDurableExecution(rule, spec.rules);
      const profile = durable
        ? { ...runtime.kernel.getDurableRuleRuntimeProfile(), events: shortProfile.events }
        : shortProfile;
      const available = new Set([...profile.actions, ...runtimeActions.filter((item) => item.implementation.kind === "delegate").map((item) => item.key)]);
      return { diagnostics: checkRuleCompatibility(rule, { ...profile, actions: available }).diagnostics.map(item => ({
        capability: item.key, support: item.support, message: item.message,
      })) };
    } catch (error) {
      return { diagnostics: [{ capability: "definition", support: "unsupported", message: error instanceof Error ? error.message : "Incomplete Rule definition." }] };
    }
  }
</script>
<RuleEditor rule={workflow} {context} {actions}
  effects={[...CORE_RULE_EFFECTS, ...runtimeActions.map((action) => ({ key: action.key, label: action.label, description: action.description, input: action.input.properties }))]}
  actorRequests={session.framework?.kernel.getDurableRuleRuntimeProfile().capabilities.actor_requests === "supported"}
  checkCompatibility={compatibility}
  onDeleted={() => goto("/build/automations")}
/>
