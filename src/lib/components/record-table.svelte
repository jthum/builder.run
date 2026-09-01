<script lang="ts">
	import { addLabel, columnLabel, emptyCollectionDescription, emptyCollectionTitle, formatCell, isStatusPath, statusVariant, typeByKey } from "$lib/app/labels.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import type { TypeDef, ViewDef } from "$lib/runtime/model.ts";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import PlusIcon from "@lucide/svelte/icons/plus";

	let {
		rows,
		view,
		typeKey,
		createHref,
		createLabel,
		emptyTitle,
		emptyDescription,
	}: {
		rows: Array<Record<string, unknown>> | null;
		view: ViewDef;
		typeKey: string;
		createHref?: string;
		createLabel?: string;
		emptyTitle?: string;
		emptyDescription?: string;
	} = $props();

	const columns = $derived(view.fields.length ? view.fields : ["id"]);
	const type = $derived(typeByKey(session.snapshot?.spec, typeKey) as TypeDef | undefined);
	const add = $derived(createLabel ?? (type ? addLabel(type) : "Add"));
</script>

{#if rows === null}
	<div class="flex flex-col gap-2">
		<Skeleton class="h-10 w-full" />
		<Skeleton class="h-10 w-full" />
		<Skeleton class="h-10 w-full" />
	</div>
{:else if rows.length === 0}
	<Empty.Root class="border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon">
				<InboxIcon />
			</Empty.Media>
			<Empty.Title>{emptyTitle ?? (type ? emptyCollectionTitle(type) : "Nothing here yet")}</Empty.Title>
			<Empty.Description>
				{emptyDescription ?? (type ? emptyCollectionDescription(type) : "Add a record to get started.")}
			</Empty.Description>
		</Empty.Header>
		{#if createHref}
			<Empty.Content>
				<Button href={createHref}>
					<PlusIcon data-icon="inline-start" />
					{add}
				</Button>
			</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				{#each columns as column (column)}
					<Table.Head>{columnLabel(column, type)}</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.id)}
				<Table.Row>
					{#each columns as column (column)}
						<Table.Cell>
							{#if column === columns[0]}
								<a class="font-medium hover:underline" href="/t/{typeKey}/{row.id}">
									{formatCell(column, row[column]) === "—" ? row.id : formatCell(column, row[column])}
								</a>
							{:else if isStatusPath(column)}
								<Badge variant={statusVariant(String(row[column] ?? ""))}>
									{formatCell(column, row[column])}
								</Badge>
							{:else}
								{formatCell(column, row[column])}
							{/if}
						</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
