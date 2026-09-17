<script lang="ts">
  import { goto } from "$app/navigation";
  import { ViewEditor } from "@jthum/framework/svelte/studio";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import RecordTable from "./record-table.svelte";
  import type { ViewDef } from "$lib/runtime/model.ts";
  let { view }: { view: ViewDef } = $props();
  const context = $derived({ collections: session.resolvedSpec?.types ?? [], views: session.resolvedSpec?.views ?? [], forms: session.resolvedSpec?.forms ?? [], rules: session.resolvedSpec?.workflows ?? [] });
</script>
<ViewEditor {view} {context} revision={session.revision}
  actions={{ save: draft => runtime().upsertView(draft), remove: key => runtime().deleteView(key), query: (draft, filters) => runtime().queryView(draft, filters) }}
  onOpen={key => goto(`/build/views/${key}`)} onDeleted={() => goto("/build/views")}
>
  {#snippet previewContent(preview)}
    <RecordTable rows={preview.rows} view={preview.view} typeKey={preview.view.source}
      exposedFields={preview.exposedFields}
      bind:exposedValues={() => preview.exposedValues, preview.onFiltersChange} compact />
  {/snippet}
</ViewEditor>
