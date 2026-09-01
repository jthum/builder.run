<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import { displayValue } from "$lib/runtime/query.ts";
	import type { ViewDef } from "$lib/runtime/model.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";

	let {
		rows,
		view,
		typeKey,
		createHref,
	}: {
		rows: Array<Record<string, unknown>>;
		view: ViewDef;
		typeKey: string;
		createHref?: string;
	} = $props();

	const columns = $derived(view.fields.length ? view.fields : ["id"]);
</script>

{#if rows.length === 0}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Title>No records yet</Empty.Title>
			<Empty.Description>Create the first {view.label.toLowerCase()} record.</Empty.Description>
		</Empty.Header>
		{#if createHref}
			<Empty.Content>
				<Button href={createHref}>
					<PlusIcon data-icon="inline-start" />
					New
				</Button>
			</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				{#each columns as column (column)}
					<Table.Head class="capitalize">{column.replaceAll(".", " ")}</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.id)}
				<Table.Row>
					{#each columns as column (column)}
						<Table.Cell>
							{#if column === columns[0]}
								<a class="font-medium hover:underline" href="/t/{typeKey}/{row.id}">{displayValue(row[column]) || row.id}</a>
							{:else}
								{displayValue(row[column])}
							{/if}
						</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
