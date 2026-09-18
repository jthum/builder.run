<script lang="ts">
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import FormEditor from "@jthum/framework/svelte/studio/form-editor";
  import { ruleSummary } from "@jthum/framework/svelte/studio/data";
  import type { FormDraft } from "@jthum/framework/svelte/studio/data";
  import { uniqueKey } from "$lib/runtime/ids.ts";
  import RecordForm from "./record-form.svelte";
  let { form }: { form: FormDraft } = $props();
  const context = $derived(canonicalStudio.context!);
  const actions = $derived(canonicalStudio.formActions());
  const relatedRules = $derived(context.rules.filter(rule =>
    rule.trigger?.key === "form.submitted" && rule.trigger.config?.form === form.key
  ));
  async function createRule(draft: FormDraft) {
    const label = `Handle ${draft.label.trim() || form.label}`;
    const key = uniqueKey(label, context.rules.map(rule => rule.key));
    const rule = { key, label, input: { values: { value: "object" as const } }, trigger: { key: "form.submitted", config: { form: form.key } }, steps: [] };
    await canonicalStudio.createRule(rule);
    await goto(`/build/automations/${key}`);
  }
</script>
<FormEditor {form} {context}
  {actions}
  onDeleted={() => goto("/build/forms")} onCreateRule={createRule}
  {relatedRules}
  ruleHref={rule => `/build/automations/${rule.key}`}
  describeRule={rule => ruleSummary(rule, context)}
>
  {#snippet previewContent(preview)}
    <RecordForm type={context.collections.find(type => type.key === preview.collection?.key)}
      form={preview.form} fields={preview.fields} fullWidth />
  {/snippet}
</FormEditor>
