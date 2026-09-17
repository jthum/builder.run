<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { goto } from "$app/navigation";
  import { RuleEditor } from "@jthum/framework/svelte/studio";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import { DEFAULT_AUTOMATION_REGISTRY } from "$lib/runtime/automation/registry.ts";
  import { BROWSER_LOCAL_AUTOMATION_PROFILE, checkAutomationCompatibility } from "$lib/runtime/automation/index.ts";
  import type { WorkflowDef } from "$lib/runtime/model.ts";
  let { workflow }: { workflow: WorkflowDef } = $props();
  const context = $derived(editorContext(session.resolvedSpec));
</script>
<RuleEditor rule={workflow} {context}
  actions={{ save: draft => runtime().upsertWorkflow(draft), remove: key => runtime().deleteWorkflow(key) }}
  effects={[...DEFAULT_AUTOMATION_REGISTRY.effects.values()]}
  checkCompatibility={draft => checkAutomationCompatibility(draft, BROWSER_LOCAL_AUTOMATION_PROFILE)}
  onDeleted={() => goto("/build/automations")}
/>
