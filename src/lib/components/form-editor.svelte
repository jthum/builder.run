<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { goto } from "$app/navigation";
  import { FormEditor } from "@jthum/framework/svelte/studio";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import { workflowSummary, workflowsForForm } from "$lib/app/relations.ts";
  import { normalizeField, type FormDef } from "$lib/runtime/model.ts";
  import { uniqueKey } from "$lib/runtime/ids.ts";
  import RecordForm from "./record-form.svelte";
  let { form }: { form: FormDef } = $props();
  const context = $derived(editorContext(session.resolvedSpec));
  async function createRule(draft: FormDef) {
    const label = `Handle ${draft.label.trim() || form.label}`;
    const key = uniqueKey(label, context.rules.map(rule => rule.key));
    await runtime().upsertWorkflow({ key, label, input: { values: { value: "object" } }, trigger: { key: "form.submitted", config: { form: form.key } }, steps: [] });
    await goto(`/build/automations/${key}`);
  }
</script>
<FormEditor {form} {context}
  actions={{ save: draft => runtime().upsertForm(draft), remove: key => runtime().deleteForm(key), prepareField: normalizeField }}
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
