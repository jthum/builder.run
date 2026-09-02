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
				{#each custom as view (view.id)}
					<a href="/build/views/{view.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title>{view.label}</Card.Title>
								<Card.Description>
									{types.find((type) => type.key === view.source)?.label ?? view.source}
									{#if view.where}
										· filtered
									{/if}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			<h2 class="text-sm font-medium text-muted-foreground">Built-in lists</h2>
			{#each builtin as view (view.id)}
				<a href="/build/views/{view.key}">
					<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
						<Card.Header>
							<Card.Title class="flex items-center gap-2">
								{view.label}
								<Badge variant="secondary">Default</Badge>
							</Card.Title>
							<Card.Description>
								{types.find((type) => type.key === view.source)?.label ?? view.source}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
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
