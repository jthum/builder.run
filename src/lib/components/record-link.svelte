<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ViewDraft } from "$lib/blocks/presentation.ts";
  import { recordHref } from "$lib/blocks/links.ts";
  import { recordPreview } from "$lib/app/record-preview.svelte.ts";
  import { cn } from "$lib/utils.ts";

  let { view, row, rows, children, class: className }: {
    view: ViewDraft;
    row: Record<string, unknown>;
    rows: Record<string, unknown>[];
    children: Snippet;
    class?: string;
  } = $props();
  const href = $derived(recordHref(view, row));
  const current = $derived(Boolean(href && recordPreview.selection?.typeKey === view.source && recordPreview.selection.id === row.id));
</script>

{#if href}
  <a {href} onclick={(event) => recordPreview.follow(event, view.source, row.id, rows)}
    aria-current={current ? "true" : undefined} data-current={current ? "true" : undefined}
    class={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring data-[current]:ring-2 data-[current]:ring-primary/20", className)}>
    {@render children()}
  </a>
{:else}
  <div class={className}>{@render children()}</div>
{/if}
