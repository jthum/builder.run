<script lang="ts">
  import RecordDetails from "@jthum/framework/svelte/records/record-details";
  import FormattedValue from "./formatted-value.svelte";
  import { presentRecord, type RecordReference } from "$lib/app/record-details.ts";
  import type { CollectionDraft } from "@jthum/framework/svelte/authoring/data";
  import type { Snippet } from "svelte";
  import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";

  let { type, record, references = {}, compact = false, showHeader = true, showSummary = true, showProperties = true, actions, children }: {
    type: CollectionDraft;
    record: Record<string, unknown>;
    references?: Record<string, RecordReference>;
    compact?: boolean;
    showHeader?: boolean;
    showSummary?: boolean;
    showProperties?: boolean;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
  const details = $derived(presentRecord(type, record, references));
</script>

<RecordDetails title={details.title} description={details.description} typeLabel={type.label} properties={showProperties ? details.properties : []} {compact} {showHeader} {actions} {children}>
  {#snippet summary()}
    {#if showSummary && details.statusKey}<FormattedValue path={details.statusKey} value={record[details.statusKey]} {type} badge />{/if}
  {/snippet}
  {#snippet renderValue(property)}
    {#if references[property.key]?.href}
      <span class="inline-flex max-w-full items-baseline gap-1.5 [&>a]:min-w-0">
        <FormattedValue path={property.key} value={property.value} {type} href={references[property.key]?.href} />
        <ArrowUpRightIcon class="size-3 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
      </span>
    {:else}
      <FormattedValue path={property.key} value={property.value} {type} badge={type.fields.find((field) => field.key === property.key)?.type === "enum"} />
    {/if}
  {/snippet}
  {#snippet metadata()}
    {#if record.created_at}<span>Created <FormattedValue path="created_at" value={record.created_at} /></span>{/if}
    {#if record.updated_at}<span>Updated <FormattedValue path="updated_at" value={record.updated_at} /></span>{/if}
  {/snippet}
</RecordDetails>
