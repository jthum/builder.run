<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import RecordPanel from "@jthum/framework/svelte/records/record-panel";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
  import * as Empty from "@jthum/framework/svelte/ui/empty";
  import { recordPreview } from "$lib/app/record-preview.svelte.ts";
  import { recordPageHref, presentRecord } from "$lib/app/record-details.ts";
  import { RecordLoader } from "$lib/app/record-loader.svelte.ts";
  import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
  import RecordDetails from "./record-details.svelte";
  import FormattedValue from "./formatted-value.svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

  const loader = new RecordLoader();
  let retry = $state(0);
  const selection = $derived(recordPreview.selection);
  const type = $derived(canonicalStudio.context?.collections.find((item) => item.key === selection?.typeKey));
  const index = $derived(selection?.ids.indexOf(selection.id) ?? -1);
  const details = $derived(type && loader.record ? presentRecord(type, loader.record, loader.references) : null);
  const title = $derived(details?.title ?? (loader.loading ? "Loading item…" : "Item details"));

  $effect(() => {
    void canonicalStudio.revision;
    void retry;
    const selected = selection;
    const collection = type;
    const collections = canonicalStudio.context?.collections ?? [];
    if (selected && collection) untrack(() => { void loader.load(collection, selected.id, canonicalStudio.recordReader(), collections); });
    return () => loader.cancel();
  });
  onDestroy(() => loader.cancel());
</script>

{#if selection}
  <div class="fixed inset-y-3 right-3 left-3 z-40 max-h-[calc(100svh-1.5rem)] sm:left-auto sm:w-[30rem] lg:w-[32rem]">
  {#key JSON.stringify([selection.typeKey, selection.id])}
  <div class="absolute inset-0"
    in:fly|global={{ x: prefersReducedMotion.current ? 0 : 24, opacity: prefersReducedMotion.current ? 1 : 0, duration: prefersReducedMotion.current ? 0 : 140, delay: prefersReducedMotion.current ? 0 : 30 }}
    out:fly|global={{ x: prefersReducedMotion.current ? 0 : 24, opacity: prefersReducedMotion.current ? 1 : 0, duration: prefersReducedMotion.current ? 0 : 90 }}>
  <RecordPanel {title} href={recordPageHref(selection.typeKey, selection.id)} onClose={() => recordPreview.close()}
    class="h-full shadow-xl">
    {#snippet navigation()}
      {#if selection.ids.length > 1}
        <span class="mr-1 text-xs text-muted-foreground tabular-nums">{index + 1} / {selection.ids.length}</span>
        <Button variant="ghost" size="icon-sm" disabled={index <= 0} onclick={() => recordPreview.move(-1)} aria-label="Previous record"><ChevronLeftIcon /></Button>
        <Button variant="ghost" size="icon-sm" disabled={index >= selection.ids.length - 1} onclick={() => recordPreview.move(1)} aria-label="Next record"><ChevronRightIcon /></Button>
      {/if}
    {/snippet}
    {#snippet summary()}
      {#if type && loader.record && details?.statusKey}
        <FormattedValue path={details.statusKey} value={loader.record[details.statusKey]} {type} badge />
      {/if}
    {/snippet}
    {#if loader.loading}
      <div class="flex flex-col gap-5 p-5" role="status" aria-label="Loading record"><Skeleton class="h-5 w-3/4" /><Skeleton class="h-32 w-full" /></div>
    {:else if loader.error}
      <Empty.Root><Empty.Header><Empty.Title>Couldn't open record</Empty.Title><Empty.Description>{loader.error}</Empty.Description></Empty.Header><Empty.Content><Button variant="outline" onclick={() => retry++}>Try again</Button></Empty.Content></Empty.Root>
    {:else if type && loader.record}
      <RecordDetails {type} record={loader.record} references={loader.references} compact showHeader={false} showSummary={false} />
    {:else}
      <Empty.Root><Empty.Header><Empty.Title>Record unavailable</Empty.Title><Empty.Description>It may have been removed, or you may not have access.</Empty.Description></Empty.Header></Empty.Root>
    {/if}
  </RecordPanel>
  </div>
  {/key}
  </div>
{/if}
