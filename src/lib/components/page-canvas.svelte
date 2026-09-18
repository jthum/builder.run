<script lang="ts">
  import { goto } from "$app/navigation";
  import PageEditor from "@jthum/framework/svelte/studio/page-editor";
  import type { PageDefinition, SpecMeta } from "@jthum/framework/spec";
  import Block from "./block.svelte";
  import { blocks, blockCategories, preloadBlock } from "$lib/blocks/registry.ts";
  import type { BlockDefinition } from "$lib/blocks/types.ts";
  import { blockInputs, blockInputOptions, collectViewKeys, defaultBlockConfig } from "$lib/runtime/blocks.ts";
  import type { PageContext } from "$lib/blocks/presentation.ts";
  import { pageBlocks } from "$lib/app/pages.ts";

  let { page, title, description, editable = true, startEditing = false, spec, revision, queryView, upsertPage }: {
    page: PageDefinition;
    title: string;
    description?: string;
    editable?: boolean;
    startEditing?: boolean;
    spec?: PageContext;
    revision: number;
    queryView: (key: string) => Promise<Array<Record<string, unknown>>>;
    upsertPage: (draft: PageDefinition) => Promise<unknown>;
  } = $props();

  let rows = $state<Record<string, Array<Record<string, unknown>>>>({});
  let ready = $state(false);

  $effect(() => {
    void revision;
    const keys = collectViewKeys(pageBlocks(page.layout));
    let cancelled = false;
    ready = false;
    void Promise.all(keys.map(async key => {
      try { return [key, await queryView(key)] as const; }
      catch (cause) { console.warn("Couldn't load view", key, cause); return [key, []] as const; }
    })).then(entries => {
      if (!cancelled) { rows = Object.fromEntries(entries); ready = true; }
    });
    return () => { cancelled = true; };
  });

  async function save(next: PageDefinition) {
    await upsertPage(next);
  }
</script>

{#key `${spec?.id}:${page.key}`}
<PageEditor {page} {title} {description} {editable} {startEditing}
  {blocks} categories={blockCategories} onPreview={preloadBlock}
  getConfig={block => spec ? defaultBlockConfig(block as BlockDefinition, spec) as SpecMeta : {}}
  getInputs={block => blockInputs(block as BlockDefinition)}
  getOptions={(input, config) => spec ? blockInputOptions(spec, input, config) : []}
  onSave={save}
  onFinish={() => { if (startEditing) void goto(location.pathname, { replace: true, shallow: true }); }}
>
  {#snippet renderBlock(node)}
    <Block node={pageBlocks([node])[0]} {rows} {ready} {spec} />
  {/snippet}
</PageEditor>
{/key}
