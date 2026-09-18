<script lang="ts">
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import CollectionEditor from "@jthum/framework/svelte/studio/collection-editor";
  import { defaultCollectionLabel } from "$lib/app/labels.ts";
  import type { CollectionDraft } from "@jthum/framework/svelte/studio/data";
  let { type }: { type: CollectionDraft } = $props();
  const context = $derived(
    type.expose ? canonicalStudio.spaceContext! : canonicalStudio.context!,
  );
  const actions = $derived(type.expose ? canonicalStudio.spaceActions() : canonicalStudio.actions());
</script>

<CollectionEditor collection={type} {context} {defaultCollectionLabel}
  canDelete={!type.expose}
  referenceLabel={item => item.expose ? `${item.label} (this space)` : item.label}
  description={type.expose ? "Exposed to apps in this space. Fields here show up in every app you create." : "The shape of this record. Lists, forms, and home update as you add fields."}
  {actions}
  onOpen={key => goto(`/build/types/${key}`)}
  onDeleted={() => goto("/build/types")}
/>
