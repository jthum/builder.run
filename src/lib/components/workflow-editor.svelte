<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import { RuleEditor } from "@jthum/framework/svelte/studio";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import { DEFAULT_AUTOMATION_REGISTRY } from "$lib/runtime/automation/registry.ts";
  import { BROWSER_LOCAL_AUTOMATION_PROFILE, checkAutomationCompatibility } from "$lib/runtime/automation/index.ts";
  import type { RuleActions, RuleDraft } from "@jthum/framework/svelte/studio";
  let { workflow, canonical = false }: { workflow: RuleDraft; canonical?: boolean } = $props();
  const context = $derived(
    canonical && canonicalStudio.context
      ? canonicalStudio.context
      : editorContext(session.resolvedSpec),
  );
  const legacyActions: RuleActions = {
    save: draft => runtime().upsertWorkflow(draft),
    remove: key => runtime().deleteWorkflow(key),
  };
  const actions = $derived(canonical ? canonicalStudio.ruleActions() : legacyActions);
</script>
<RuleEditor rule={workflow} {context}
  {actions}
  effects={[...DEFAULT_AUTOMATION_REGISTRY.effects.values()]}
  checkCompatibility={draft => checkAutomationCompatibility(draft, BROWSER_LOCAL_AUTOMATION_PROFILE)}
  onDeleted={() => goto("/build/automations")}
/>
