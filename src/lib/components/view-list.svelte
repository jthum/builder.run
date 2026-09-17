<script lang="ts">
	import { isStatusPath } from "$lib/app/labels.ts";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { Separator } from "@jthum/framework/svelte/ui/separator";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import type { TypeDef, ViewDef } from "$lib/runtime/model.ts";
	import InboxIcon from "@lucide/svelte/icons/inbox";

	let {
		rows,
		view,
		type,
	}: {
		rows: Array<Record<string, unknown>> | null;
		view: ViewDef;
		type?: TypeDef;
	} = $props();

	const fields = $derived(view.fields.length ? view.fields : ["id"]);
	const titleField = $derived(fields[0] ?? "id");
	const secondary = $derived(fields[1]);
</script>

{#if rows === null}
	<div class="flex flex-col gap-2">
		<Skeleton class="h-12 w-full" />
		<Skeleton class="h-12 w-full" />
		<Skeleton class="h-12 w-full" />
	</div>
{:else if !rows.length}
	<Empty.Root class="border-0 py-8">
		<Empty.Header>
			<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
			<Empty.Title>Nothing here yet</Empty.Title>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="overflow-hidden rounded-xl border bg-background">
		{#each rows as row, index (String(row.id ?? index))}
			{#if index > 0}<Separator />{/if}
			<a
				href="/t/{view.source}/{row.id}"
				class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
			>
				<div class="min-w-0 flex flex-col gap-0.5">
					<span class="truncate font-medium">
						<FormattedValue path={titleField} value={row[titleField]} {type} />
					</span>
					{#if secondary}
						<span class="truncate text-sm text-muted-foreground">
							<FormattedValue
								path={secondary}
								value={row[secondary]}
								{type}
								badge={isStatusPath(secondary)}
							/>
						</span>
					{/if}
				</div>
				{#if fields[2]}
					<span class="shrink-0 text-sm text-muted-foreground">
						<FormattedValue
							path={fields[2]}
							value={row[fields[2]]}
							{type}
							badge={isStatusPath(fields[2])}
						/>
					</span>
				{/if}
			</a>
		{/each}
	</div>
{/if}
