<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import { goto } from "$app/navigation";
  import { CollectionEditor } from "@jthum/framework/svelte/studio";
  import { defaultCollectionLabel } from "$lib/app/labels.ts";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import type { CollectionActions, CollectionDraft } from "@jthum/framework/svelte/studio";
  let { type, canonical = false }: { type: CollectionDraft; canonical?: boolean } = $props();
  const context = $derived(
    canonical && canonicalStudio.context
      ? canonicalStudio.context
      : editorContext(session.resolvedSpec),
  );
  const legacyActions: CollectionActions = {
    save: draft => runtime().upsertType(draft),
    rename: (key, next) => runtime().renameType(key, next),
    renameField: (collection, key, next) => runtime().renameField(collection, key, next),
    saveField: (collection, field) => runtime().upsertField(collection, field),
    reorderFields: (collection, keys) => runtime().reorderFields(collection, keys),
    deleteField: (collection, key) => runtime().deleteField(collection, key),
    remove: key => runtime().deleteType(key),
  };
  const actions = $derived(canonical && !type.expose ? canonicalStudio.actions() : legacyActions);
</script>

<CollectionEditor collection={type} {context} {defaultCollectionLabel}
  canDelete={!type.expose}
  referenceLabel={item => item.expose ? `${item.label} (this space)` : item.label}
  description={type.expose ? "Exposed to apps in this space. Fields here show up in every app you create." : "The shape of this record. Lists, forms, and home update as you add fields."}
  {actions}
  onOpen={key => goto(`/build/types/${key}`)}
  onDeleted={() => goto("/build/types")}
/>
