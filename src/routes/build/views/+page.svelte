<script lang="ts">
	import { goto } from "$app/navigation";
	import { session, runtime } from "$lib/app/session.svelte.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import TableIcon from "@lucide/svelte/icons/table";

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const views = $derived(spec?.views ?? []);
	const custom = $derived(views.filter((view) => !view.implicit));
	const builtin = $derived(views.filter((view) => view.implicit));

	let open = $state(false);

	async function create(name: string) {
		const key = slugify(name);
		await runtime().upsertView({
			key,
			label: name,
			source: types[0]?.key ?? "",
			fields: types[0]?.fields.slice(0, 4).map((field) => field.key) ?? [],
			implicit: false,
		});
		await goto(`/build/views/${key}`);
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Views"
		description="Saved lists with filters, so people see what matters — unpaid invoices, active projects, anything you can name."
	>
		{#snippet actions()}
			<Button onclick={() => (open = true)} disabled={!types.length}>
				<PlusIcon data-icon="inline-start" />
				Add view
			</Button>
		{/snippet}
	</PageHeader>

	{#if !views.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><TableIcon /></Empty.Media>
				<Empty.Title>No lists yet</Empty.Title>
				<Empty.Description>Add a record type first, then save a filtered list of it.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#if custom.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Featured</h2>
				<div class="grid gap-4 md:grid-cols-2">
					{#each custom as view (view.id)}
						<a href="/build/views/{view.key}" class="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
							<Card.Root size="sm" class="h-full transition-all hover:ring-foreground/20">
								<Card.Header class="gap-0">
									<Card.Title>{view.label}</Card.Title>
									<Card.Description>{types.find((type) => type.key === view.source)?.label ?? view.source}</Card.Description>
									<Card.Action><Badge variant="secondary">Featured</Badge></Card.Action>
								</Card.Header>
								<Card.Content class="flex flex-1 flex-wrap content-start gap-1.5">
									<Badge variant="outline">{view.fields.length} {view.fields.length === 1 ? "column" : "columns"}</Badge>
									{#if view.where}<Badge variant="outline">Filtered</Badge>{/if}
									{#if view.group_by}<Badge variant="outline">Grouped</Badge>{/if}
									{#if view.order_by?.length}<Badge variant="outline">Sorted</Badge>{/if}
								</Card.Content>
								<Card.Footer class="justify-end"><span class="flex items-center gap-1 text-sm font-medium">Edit view <ArrowRightIcon class="size-4" /></span></Card.Footer>
							</Card.Root>
						</a>
					{/each}
				</div>
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			<h2 class="text-sm font-medium text-muted-foreground">Built-in lists</h2>
			<div class="grid gap-4 md:grid-cols-2">
				{#each builtin as view (view.id)}
					<a href="/build/views/{view.key}" class="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<Card.Root size="sm" class="h-full transition-all hover:ring-foreground/20">
							<Card.Header class="gap-0">
								<Card.Title>{view.label}</Card.Title>
								<Card.Description>{types.find((type) => type.key === view.source)?.label ?? view.source}</Card.Description>
								<Card.Action><Badge variant="secondary">Default</Badge></Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-1 flex-wrap content-start gap-1.5">
								<Badge variant="outline">{view.fields.length} {view.fields.length === 1 ? "column" : "columns"}</Badge>
								{#if view.where}<Badge variant="outline">Filtered</Badge>{/if}
								{#if view.group_by}<Badge variant="outline">Grouped</Badge>{/if}
								{#if view.order_by?.length}<Badge variant="outline">Sorted</Badge>{/if}
							</Card.Content>
							<Card.Footer class="justify-end"><span class="flex items-center gap-1 text-sm font-medium">Edit view <ArrowRightIcon class="size-4" /></span></Card.Footer>
						</Card.Root>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<NameDialog
	bind:open
	title="New view"
	description="A named list of records. You'll pick columns and filters next."
	confirm="Create view"
	onSubmit={create}
/>
