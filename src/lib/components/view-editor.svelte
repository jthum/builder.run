<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import { ViewEditor } from "@jthum/framework/svelte/studio";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import RecordTable from "./record-table.svelte";
  import type { ViewActions, ViewDraft } from "@jthum/framework/svelte/studio";
  let { view, canonical = false }: { view: ViewDraft; canonical?: boolean } = $props();
  const context = $derived(
    canonical && canonicalStudio.context
      ? canonicalStudio.context
      : editorContext(session.resolvedSpec),
  );
  const legacyActions: ViewActions = {
    save: draft => runtime().upsertView(draft),
    remove: key => runtime().deleteView(key),
    query: (draft, filters) => runtime().queryView(draft, filters),
  };
  const actions = $derived(canonical ? canonicalStudio.viewActions() : legacyActions);
  const revision = $derived(canonical ? canonicalStudio.revision : session.revision);
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
