<script lang="ts">
	import { columnLabel, isStatusPath } from "$lib/app/labels.ts";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { viewCellValue, viewDisplayFields } from "$lib/app/view-results.ts";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import type { CollectionDraft, ViewDraft } from "$lib/blocks/presentation.ts";
	import InboxIcon from "@lucide/svelte/icons/inbox";

	let {
		rows,
		view,
		type,
	}: {
		rows: Array<Record<string, unknown>> | null;
		view: ViewDraft;
		type?: CollectionDraft;
	} = $props();

	const visibleFields = $derived(viewDisplayFields(view, type));
	const fields = $derived(visibleFields.length ? visibleFields : ["id"]);
	const titleField = $derived(fields[0] ?? "id");
	const rest = $derived(fields.slice(1, 4));
</script>

{#if rows === null}
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		<Skeleton class="h-32 w-full" />
		<Skeleton class="h-32 w-full" />
		<Skeleton class="h-32 w-full" />
	</div>
{:else if !rows.length}
	<Empty.Root class="border-0 py-8">
		<Empty.Header>
			<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
			<Empty.Title>Nothing here yet</Empty.Title>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each rows as row (String(row.id ?? JSON.stringify(row)))}
			<a href="/t/{view.source}/{row.id}" class="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Card.Root class="h-full transition-all hover:ring-foreground/20">
					<Card.Content class="flex flex-col gap-3 p-5">
						<p class="font-medium">
							<FormattedValue path={titleField} value={viewCellValue(view, row, titleField)} {type} />
						</p>
						{#if rest.length}
							<dl class="flex flex-col gap-1.5">
								{#each rest as path (path)}
									<div class="flex items-center justify-between gap-3 text-sm">
										<dt class="text-muted-foreground">{columnLabel(path, type)}</dt>
										<dd>
											<FormattedValue {path} value={viewCellValue(view, row, path)} {type} badge={isStatusPath(path)} />
										</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>
{/if}
