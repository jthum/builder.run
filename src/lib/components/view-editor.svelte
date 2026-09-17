<script lang="ts">
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import { ViewEditor } from "@jthum/framework/svelte/studio";
  import RecordTable from "./record-table.svelte";
  import type { ViewDraft } from "@jthum/framework/svelte/studio";
  let { view }: { view: ViewDraft } = $props();
  const context = $derived(canonicalStudio.context!);
  const actions = $derived(canonicalStudio.viewActions());
  const revision = $derived(canonicalStudio.revision);
</script>
<ViewEditor {view} {context} {revision} {actions}
  onOpen={key => goto(`/build/views/${key}`)} onDeleted={() => goto("/build/views")}
>
  {#snippet previewContent(preview)}
    <RecordTable rows={preview.rows} view={preview.view} typeKey={preview.view.source}
      exposedFields={preview.exposedFields}
      bind:exposedValues={() => preview.exposedValues, preview.onFiltersChange} compact />
  {/snippet}
</ViewEditor>
