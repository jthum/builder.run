<script lang="ts">
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import { RuleEditor } from "@jthum/framework/svelte/studio";
  import { DEFAULT_AUTOMATION_REGISTRY } from "$lib/runtime/automation/registry.ts";
  import { BROWSER_LOCAL_AUTOMATION_PROFILE, checkAutomationCompatibility } from "$lib/runtime/automation/index.ts";
  import type { RuleDraft } from "@jthum/framework/svelte/studio";
  let { workflow }: { workflow: RuleDraft } = $props();
  const context = $derived(canonicalStudio.context!);
  const actions = $derived(canonicalStudio.ruleActions());
</script>
<RuleEditor rule={workflow} {context}
  {actions}
  effects={[...DEFAULT_AUTOMATION_REGISTRY.effects.values()]}
  checkCompatibility={draft => checkAutomationCompatibility(draft, BROWSER_LOCAL_AUTOMATION_PROFILE)}
  onDeleted={() => goto("/build/automations")}
/>
