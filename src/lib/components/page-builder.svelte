<script lang="ts">
	import { goto } from "$app/navigation";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const spec = $derived(session.snapshot?.spec);
	const pages = $derived(spec?.pages ?? []);
	const custom = $derived(pages.filter((page) => !page.implicit));
	const builtin = $derived(pages.filter((page) => page.implicit));

	let open = $state(false);

	async function create(name: string) {
		const key = slugify(name);
		await runtime().upsertPage({
			key,
			label: name,
			blocks: [
				{
					kind: "group",
					columns: 1,
					blocks: [
						{
							kind: "widget",
							widget: "heading",
							values: { title: name, description: "" },
						},
					],
				},
			],
		});
		await goto(`/p/${key}`);
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Pages"
		description="Screens made of grids and widgets. Open a page to edit its layout."
	>
		{#snippet actions()}
			<Button onclick={() => (open = true)}>
				<PlusIcon data-icon="inline-start" />
				Add page
			</Button>
		{/snippet}
	</PageHeader>

	{#if !custom.length && !builtin.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><LayersIcon /></Empty.Media>
				<Empty.Title>No extra pages</Empty.Title>
				<Empty.Description>Record lists already exist. Add a page when you want a custom screen.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#if custom.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Custom</h2>
				{#each custom as item (item.id)}
					<a href={item.key === "home" || item.path === "/" ? "/" : `/p/${item.key}`}>
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title>{item.label}</Card.Title>
								<Card.Description>{item.blocks.length} {item.blocks.length === 1 ? "block" : "blocks"}</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
		{#if builtin.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Built-in</h2>
				{#each builtin as item (item.id)}
					<a href="/t/{item.path?.replace('/t/', '') ?? item.key.replace(/_page$/, '')}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title class="flex items-center gap-2">
									{item.label}
									<Badge variant="secondary">Default</Badge>
								</Card.Title>
								<Card.Description>Record list</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<NameDialog
	bind:open
	title="New page"
	description="A custom screen in the app menu."
	confirm="Create page"
	onSubmit={create}
/>
