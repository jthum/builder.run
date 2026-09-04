<script lang="ts">
	import { columnLabel, isStatusPath } from "$lib/app/labels.ts";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { cellValue } from "$lib/runtime/chart-data.ts";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { TypeDef, ViewDef } from "$lib/runtime/model.ts";
	import InboxIcon from "@lucide/svelte/icons/inbox";

	let {
		view,
		type,
		title = "",
		field,
		rows,
		ready = true,
	}: {
		view: ViewDef;
		type?: TypeDef;
		title?: string;
		field: string;
		rows: Array<Record<string, unknown>> | null;
		ready?: boolean;
	} = $props();

	const titleField = $derived(view.fields[0] ?? "id");
	const rest = $derived(view.fields.filter((item) => item !== field).slice(1, 3));
	const columns = $derived.by(() => {
		const defined = type?.fields.find((item) => item.key === field)?.values ?? [];
		const seen = new Set(defined);
		const extra: string[] = [];
		for (const row of rows ?? []) {
			const raw = cellValue(row, field);
			const key = raw == null || raw === "" ? "None" : String(raw);
			if (!seen.has(key)) {
				seen.add(key);
				extra.push(key);
			}
		}
		return [...defined, ...extra];
	});
	const grouped = $derived.by(() => {
		const map = new Map<string, Array<Record<string, unknown>>>();
		for (const key of columns) map.set(key, []);
		for (const row of rows ?? []) {
			const raw = cellValue(row, field);
			const key = raw == null || raw === "" ? "None" : String(raw);
			const list = map.get(key) ?? [];
			list.push(row);
			map.set(key, list);
		}
		return map;
	});
</script>

<Card.Root class="h-full min-h-80 w-full">
	{#if title}
		<Card.Header>
			<Card.Title>{title}</Card.Title>
		</Card.Header>
	{/if}
	<Card.Content class="flex min-h-0 flex-1 flex-col">
		{#if !ready}
			<div class="grid flex-1 grid-cols-3 gap-3">
				<Skeleton class="h-64 w-full" />
				<Skeleton class="h-64 w-full" />
				<Skeleton class="h-64 w-full" />
			</div>
		{:else if !rows?.length}
			<Empty.Root class="flex-1 border-0 py-8">
				<Empty.Header>
					<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
					<Empty.Title>Nothing on the board yet</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
				{#each columns as column (column)}
					{@const items = grouped.get(column) ?? []}
					<section class="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/40 p-2">
						<header class="flex items-center justify-between gap-2 px-1 py-0.5">
							<h3 class="text-sm font-medium">{labelFromKey(column)}</h3>
							<Badge variant="secondary" class="tabular-nums">{items.length}</Badge>
						</header>
						<div class="flex flex-1 flex-col gap-2">
							{#each items as row (String(row.id ?? JSON.stringify(row)))}
								<a
									href="/t/{view.source}/{row.id}"
									class="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<Card.Root class="hover:ring-foreground/20">
										<Card.Content class="flex flex-col gap-1.5 p-3">
											<p class="text-sm font-medium">
												<FormattedValue path={titleField} value={row[titleField]} {type} />
											</p>
											{#each rest as path (path)}
												<p class="text-xs text-muted-foreground">
													{columnLabel(path, type)}
													<FormattedValue {path} value={row[path]} {type} badge={isStatusPath(path)} />
												</p>
											{/each}
										</Card.Content>
									</Card.Root>
								</a>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
