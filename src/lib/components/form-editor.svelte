<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import { FormEditor } from "@jthum/framework/svelte/studio";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import { workflowSummary, workflowsForForm } from "$lib/app/relations.ts";
  import { normalizeField } from "$lib/runtime/model.ts";
  import type { FormActions, FormDraft } from "@jthum/framework/svelte/studio";
  import { uniqueKey } from "$lib/runtime/ids.ts";
  import RecordForm from "./record-form.svelte";
  let { form, canonical = false }: { form: FormDraft; canonical?: boolean } = $props();
  const context = $derived(
    canonical && canonicalStudio.context
      ? canonicalStudio.context
      : editorContext(session.resolvedSpec),
  );
  const legacyActions: FormActions = {
    save: draft => runtime().upsertForm(draft),
    remove: key => runtime().deleteForm(key),
    prepareField: normalizeField,
  };
  const actions = $derived(canonical ? canonicalStudio.formActions() : legacyActions);
  async function createRule(draft: FormDraft) {
    const label = `Handle ${draft.label.trim() || form.label}`;
    const key = uniqueKey(label, context.rules.map(rule => rule.key));
    const rule = { key, label, input: { values: { value: "object" as const } }, trigger: { key: "form.submitted", config: { form: form.key } }, steps: [] };
    if (canonical) await canonicalStudio.createRule(rule);
    else await runtime().upsertWorkflow(rule);
    await goto(`/build/automations/${key}`);
  }
</script>
<FormEditor {form} {context}
  {actions}
  onDeleted={() => goto("/build/forms")} onCreateRule={createRule}
  relatedRules={workflowsForForm(session.resolvedSpec, form.key)}
  ruleHref={rule => `/build/automations/${rule.key}`}
  describeRule={rule => workflowSummary(rule, session.resolvedSpec)}
>
  {#snippet previewContent(preview)}
    <RecordForm type={session.resolvedSpec?.types.find(type => type.key === preview.collection?.key)}
      form={preview.form} fields={preview.fields} fullWidth />
  {/snippet}
</FormEditor>
