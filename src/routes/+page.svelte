<script lang="ts">
	import { addLabel, collectionLabel, countLabel, featuredViews, isBlankApp } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { implicitViewKey } from "$lib/runtime/defaults.ts";
	import { sampleApps } from "$lib/runtime/samples.ts";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.snapshot?.spec);
	const views = $derived(spec ? featuredViews(spec) : []);
	const types = $derived(spec?.types ?? []);
	const blank = $derived(spec ? isBlankApp(spec) : true);

	let counts = $state<Record<string, number>>({});
	let countsReady = $state(false);

	$effect(() => {
		void session.revision;
		const current = session.snapshot?.spec;
		if (!current) return;
		countsReady = false;
		void (async () => {
			const next: Record<string, number> = {};
			for (const view of featuredViews(current)) {
				next[view.key] = (await runtime().queryView(view.key)).length;
			}
			for (const type of current.types) {
				const view = current.views.find((item) => item.key === implicitViewKey(type.key));
				if (!view) continue;
				next[type.key] = (await runtime().queryView(view.key)).length;
			}
			counts = next;
			countsReady = true;
		})();
	});

	async function useTemplate(key: string, label: string) {
		await runtime().loadSample(key);
		toast.success(`${label} is ready`);
	}

</script>

<div class="flex flex-col gap-8">
	<PageHeader
		title={session.snapshot?.workspace.name ?? "Home"}
		description={blank
			? "Start from a template, or add people and organisations you already work with."
			: "Lists that need attention, and every record in this app."}
	/>

	{#if blank}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon">
					<LayersIcon />
				</Empty.Media>
				<Empty.Title>Start with a template</Empty.Title>
				<Empty.Description>
					Templates give you records, lists, and actions you can use immediately — then change.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
		<div class="grid gap-4 md:grid-cols-3">
			{#each sampleApps as sample (sample.key)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{sample.label}</Card.Title>
						<Card.Description>{sample.description}</Card.Description>
					</Card.Header>
					<Card.Footer>
						<Button size="sm" data-testid="load-sample" data-sample={sample.key} onclick={() => useTemplate(sample.key, sample.label)}>
							Use template
						</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
		<div class="flex flex-col gap-3">
			<h2 class="text-lg font-medium">Shared directory</h2>
			<p class="text-sm text-muted-foreground">Organisations and contacts are shared across apps in this place.</p>
			<div class="grid gap-4 md:grid-cols-2">
				{#each types as type (type.id)}
					<Card.Root>
						<Card.Header>
							<Card.Title>{collectionLabel(type)}</Card.Title>
							<Card.Description>
								{#if countsReady}
									{countLabel(counts[type.key] ?? 0, collectionLabel(type))}
								{:else}
									<Skeleton class="h-4 w-24" />
								{/if}
							</Card.Description>
						</Card.Header>
						<Card.Footer class="gap-2">
							<Button href="/t/{type.key}" size="sm" variant="outline">Open</Button>
							<Button href="/t/{type.key}/new" size="sm">
								<PlusIcon data-icon="inline-start" />
								{addLabel(type)}
							</Button>
						</Card.Footer>
					</Card.Root>
				{/each}
			</div>
		</div>
	{:else}
		{#if views.length}
			<div class="flex flex-col gap-3">
				<h2 class="text-lg font-medium">Needs attention</h2>
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each views as view (view.id)}
						<Card.Root>
							<Card.Header>
								<Card.Title>{view.label}</Card.Title>
								<Card.Description>
									{#if countsReady}
										{counts[view.key] === 0 ? "All clear" : counts[view.key] === 1 ? "1 item" : `${counts[view.key]} items`}
									{:else}
										<Skeleton class="h-4 w-20" />
									{/if}
								</Card.Description>
							</Card.Header>
							<Card.Footer>
								<Button href="/v/{view.key}" size="sm">Open</Button>
							</Card.Footer>
						</Card.Root>
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex flex-col gap-3">
			<h2 class="text-lg font-medium">Records</h2>
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each types as type (type.id)}
					<Card.Root>
						<Card.Header>
							<Card.Title>{collectionLabel(type)}</Card.Title>
							<Card.Description>
								{#if countsReady}
									{countLabel(counts[type.key] ?? 0, collectionLabel(type))}
								{:else}
									<Skeleton class="h-4 w-24" />
								{/if}
							</Card.Description>
						</Card.Header>
						<Card.Footer class="gap-2">
							<Button href="/t/{type.key}" size="sm" variant="outline">Open</Button>
							<Button href="/t/{type.key}/new" size="sm">
								<PlusIcon data-icon="inline-start" />
								{addLabel(type)}
							</Button>
						</Card.Footer>
					</Card.Root>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<h2 class="text-lg font-medium">Start another app</h2>
			<div class="grid gap-4 md:grid-cols-3">
				{#each sampleApps as sample (sample.key)}
					<Card.Root>
						<Card.Header>
							<Card.Title>{sample.label}</Card.Title>
							<Card.Description>{sample.description}</Card.Description>
						</Card.Header>
						<Card.Footer>
							<Button size="sm" variant="outline" data-testid="load-sample" data-sample={sample.key} onclick={() => useTemplate(sample.key, sample.label)}>
								Use template
							</Button>
						</Card.Footer>
					</Card.Root>
				{/each}
			</div>
		</div>
	{/if}
</div>
