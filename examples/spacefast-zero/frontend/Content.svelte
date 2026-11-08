<script lang="ts">
  import { canonicalStudio as data } from "./data.svelte.ts";
  import PageContent from "@jthum/framework/svelte/authoring/page-content";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import Block from "$lib/components/block.svelte";
  import RecordTable from "$lib/components/record-table.svelte";
  import RecordForm from "$lib/components/record-form.svelte";
  import RecordDetails from "$lib/components/record-details.svelte";
  import ViewCards from "$lib/components/view-cards.svelte";
  import ViewList from "$lib/components/view-list.svelte";
  import Kanban from "$lib/components/kanban-board.svelte";
  import { blocks } from "$lib/blocks/registry.ts";
  import { pageBlocks, pageContext } from "$lib/app/pages.ts";
  import { collectViewKeys } from "$lib/runtime/blocks.ts";
  import { loadRecordDetails } from "$lib/app/record-details.ts";
  import type { ViewDraft } from "@jthum/framework/svelte/authoring/data";

  let { path, navigate }: {path: string; navigate: (href: string) => void} = $props();
  const parts = $derived(path.split("/").filter(Boolean).map(decodeURIComponent));
  const page = $derived(data.spec?.pages.find(item => item.key === parts[1] || (path === "/" && (item.meta?.path === "/" || item.key === "home"))));
  const view = $derived(data.context?.views.find(item => item.key === parts[1]));
  const form = $derived(data.context?.forms.find(item => item.key === parts[1]));
  const collection = $derived(data.context?.collections.find(item => item.key === (parts[0] === "f" ? form?.type : parts[0] === "v" ? view?.source : parts[1])));
  const recordId = $derived(parts[0] === "t" && parts[2] && parts[2] !== "new" ? parts[2] : undefined);
  const edit = $derived(parts[3] === "edit");
  const tableView = $derived(view ?? { id: `collection-${collection?.id}`, key: collection?.key ?? "", label: collection?.label ?? "", source: collection?.key ?? "", fields: collection?.fields.map(field => field.key) ?? [] } satisfies ViewDraft);
  const presentation = $derived(data.spec && data.context ? pageContext(data.spec, data.context) : undefined);
  let pending = $state(true);
  let error = $state("");
  let rows = $state<Array<Record<string, unknown>>>([]);
  let pageRows = $state<Record<string, Array<Record<string, unknown>>>>({});
  let detail = $state<Awaited<ReturnType<typeof loadRecordDetails>> | null>(null);
  let parameters = $state<Record<string,string>>({});
  const exposedFields = $derived((view?.expose ?? []).flatMap(key => collection?.fields.filter(field => field.key === key) ?? []));

  $effect(() => {
    void data.revision;
    const currentPath = path;
    const currentParameters = {...parameters};
    const currentPage = page;
    const currentView = view;
    const currentCollection = collection;
    const currentRecord = recordId;
    let cancelled = false;
    pending = true; error = "";
    void (async () => {
      if (parts[0] === "p" || currentPath === "/") {
        if (!currentPage) return;
        const keys = collectViewKeys(pageBlocks(currentPage.layout));
        const entries = await Promise.all(keys.map(async key => [key, await data.queryView(key)] as const));
        if (!cancelled) pageRows = Object.fromEntries(entries);
      } else if (parts[0] === "v" && currentView) {
        const result = await data.queryViewWith(currentView.key, currentParameters);
        if (!cancelled) rows = result;
      } else if (parts[0] === "t" && currentCollection && currentRecord) {
        const result = await loadRecordDetails(currentCollection, currentRecord, data.recordReader(), data.context?.collections ?? []);
        if (!cancelled) detail = result;
      } else if (parts[0] === "t" && currentCollection && !parts[2]) {
        const result = await data.listRecords(currentCollection.key);
        if (!cancelled) rows = result;
      }
    })().catch(cause => { if (!cancelled) error = cause instanceof Error ? cause.message : String(cause); })
      .finally(() => { if (!cancelled) pending = false; });
    return () => { cancelled = true; };
  });
</script>

{#if error}
  <Alert.Root variant="destructive"><Alert.Title>Couldn't load this page</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>
{:else if (parts[0] === "p" || path === "/") && page}
  <h1 class="mb-6 text-2xl font-semibold">{page.label}</h1>
  <PageContent layout={page.layout} {blocks}>
    {#snippet renderBlock(node)}<Block node={pageBlocks([node])[0]} rows={pageRows} ready={!pending} spec={presentation} />{/snippet}
  </PageContent>
{:else if (parts[0] === "v" && view) || (parts[0] === "t" && collection && !parts[2])}
  <div class="mb-6 flex items-center justify-between gap-4"><h1 class="text-2xl font-semibold">{tableView.label}</h1>
    {#if collection && !view?.group_by}<Button href={`/t/${encodeURIComponent(collection.key)}/new`}>Add {collection.label}</Button>{/if}
  </div>
  {#if view?.presentation?.block === "kanban"}
    <Kanban {view} type={collection} rows={pending ? null : rows} field={String(view.presentation.config?.field ?? "status")} />
  {:else if view?.presentation?.block === "cards"}
    <ViewCards {view} type={collection} rows={pending ? null : rows} />
  {:else if view?.presentation?.block === "list"}
    <ViewList {view} type={collection} rows={pending ? null : rows} />
  {:else}
    <RecordTable view={tableView} typeKey={collection?.key ?? tableView.source} rows={pending ? null : rows} {exposedFields} bind:exposedValues={parameters} />
  {/if}
{:else if parts[0] === "f" && form}
  <h1 class="mb-6 text-2xl font-semibold">{form.label}</h1>
  <RecordForm type={collection} {form} fields={form.fields} onSaved={record => { if (record && collection) navigate(`/t/${collection.key}/${record.id}`); }} />
{:else if parts[0] === "t" && collection && parts[2] === "new"}
  <h1 class="mb-6 text-2xl font-semibold">Add {collection.label}</h1>
  <RecordForm type={collection} onSaved={record => { if (record) navigate(`/t/${collection.key}/${record.id}`); }} onCancel={() => navigate(`/t/${collection.key}`)} />
{:else if parts[0] === "t" && collection && detail?.record && !pending}
  {#if edit}
    <h1 class="mb-6 text-2xl font-semibold">Edit {collection.label}</h1>
    <RecordForm type={collection} record={detail.record} onSaved={() => navigate(`/t/${collection.key}/${recordId}`)} onCancel={() => navigate(`/t/${collection.key}/${recordId}`)} />
  {:else}
    <RecordDetails type={collection} record={detail.record} references={detail.references}>
      {#snippet actions()}<Button variant="outline" href={`/t/${collection.key}/${recordId}/edit`}>Edit</Button>{/snippet}
    </RecordDetails>
  {/if}
{:else if pending}
  <p class="text-muted-foreground" role="status">Loading…</p>
{:else}
  <h1 class="text-2xl font-semibold">{data.spec?.label}</h1><p class="mt-2 text-muted-foreground">Choose a page, view, or collection from the navigation.</p>
{/if}
