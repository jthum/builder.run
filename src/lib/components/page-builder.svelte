<script lang="ts">
  import { goto } from "$app/navigation";
  import { PageList } from "@jthum/framework/svelte/studio";
  import type { PageDefinition } from "@jthum/framework/spec";
  import type { AppSpec, PageDef } from "$lib/runtime/model.ts";
  import { authoredNavPages } from "$lib/runtime/blocks.ts";
  import { pageBlocks, pageDefinition } from "$lib/app/pages.ts";

  let { spec, upsertPage, deletePage, replacePages }: {
    spec?: AppSpec;
    upsertPage: (draft: Partial<PageDef> & { key: string }) => Promise<PageDef>;
    deletePage: (key: string) => Promise<void>;
    replacePages: (pages: PageDef[]) => Promise<void>;
  } = $props();

  const definitions = $derived(spec ? authoredNavPages(spec).map(pageDefinition) : []);
  function draft(page: PageDefinition): PageDef {
    return { ...spec?.pages.find(item => item.id === page.id), id: page.id, key: page.key,
      label: page.label, meta: page.meta,
      icon: typeof page.meta?.icon === "string" ? page.meta.icon : undefined,
      folder: typeof page.meta?.folder === "string" ? page.meta.folder : "",
      blocks: pageBlocks(page.layout) };
  }
</script>

<PageList {definitions}
  upsertPage={async page => { await upsertPage(draft(page)); }} {deletePage}
  replacePages={async pages => { await replacePages(pages.map(draft)); }}
  pageHref={page => `/p/${page.key}`}
  onOpen={(page, editing) => goto(`/p/${page.key}${editing ? "?edit=1" : ""}`)}
  emptyDescription="Home is already there. Add a page when you want another screen in the menu. Record lists live under Records."
  placementDescription="Pages in this folder appear together under Home."
/>
