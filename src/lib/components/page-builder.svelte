<script lang="ts">
  import { goto } from "$app/navigation";
  import PageList from "@jthum/framework/svelte/studio/page-list";
  import type { PageDefinition } from "@jthum/framework/spec";

  let { definitions, upsertPage, deletePage, replacePages }: {
    definitions: readonly PageDefinition[];
    upsertPage: (draft: PageDefinition) => Promise<unknown>;
    deletePage: (key: string) => Promise<void>;
    replacePages: (pages: readonly PageDefinition[]) => Promise<void>;
  } = $props();
</script>

<PageList {definitions}
  {upsertPage} {deletePage} {replacePages}
  pageHref={page => `/p/${page.key}`}
  onOpen={(page, editing) => goto(`/p/${page.key}${editing ? "?edit=1" : ""}`)}
  emptyDescription="Home is already there. Add a page when you want another screen in the menu. Record lists live under Records."
  placementDescription="Pages in this folder appear together under Home."
/>
