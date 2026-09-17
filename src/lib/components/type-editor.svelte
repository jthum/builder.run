<script lang="ts">
  import { editorContext } from "$lib/app/studio.ts";
  import { goto } from "$app/navigation";
  import { CollectionEditor } from "@jthum/framework/svelte/studio";
  import { defaultCollectionLabel } from "$lib/app/labels.ts";
  import { runtime, session } from "$lib/app/session.svelte.ts";
  import type { TypeDef } from "$lib/runtime/model.ts";
  let { type }: { type: TypeDef } = $props();
  const context = $derived(editorContext(session.resolvedSpec));
</script>

<CollectionEditor collection={type} {context} {defaultCollectionLabel}
  canDelete={!type.expose}
  referenceLabel={item => item.expose ? `${item.label} (this space)` : item.label}
  description={type.expose ? "Exposed to apps in this space. Fields here show up in every app you create." : "The shape of this record. Lists, forms, and home update as you add fields."}
  actions={{
    save: draft => runtime().upsertType(draft),
    rename: (key, next) => runtime().renameType(key, next),
    renameField: (collection, key, next) => runtime().renameField(collection, key, next),
    saveField: (collection, field) => runtime().upsertField(collection, field),
    reorderFields: (collection, keys) => runtime().reorderFields(collection, keys),
    deleteField: (collection, key) => runtime().deleteField(collection, key),
    remove: key => runtime().deleteType(key),
  }}
  onOpen={key => goto(`/build/types/${key}`)}
  onDeleted={() => goto("/build/types")}
/>
