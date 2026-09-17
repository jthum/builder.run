<script lang="ts">
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import BlockLibraryItem from "$lib/components/block-library-item.svelte";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import { blockCategories, blocks, type BlockCategory } from "$lib/runtime/blocks.ts";
	import { preloadBlockAssets } from "$lib/blocks/registry.ts";
	import ChartNoAxesCombinedIcon from "@lucide/svelte/icons/chart-no-axes-combined";
	import DatabaseIcon from "@lucide/svelte/icons/database";
	import LayoutTemplateIcon from "@lucide/svelte/icons/layout-template";
	import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import type { Component } from "svelte";

	const wide = new Set(["hero", "section_heading", "table", "cards", "timeline", "kanban", "calendar", "form"]);
	const tall = new Set(["bar", "line", "donut", "stacked_bar", "funnel", "scatter", "heatmap", "kanban", "calendar"]);
	const categoryDetails: Record<BlockCategory, { description: string; icon: Component }> = {
		highlights: {
			description: "Prominent summaries and signals that establish the purpose of a page.",
			icon: SparklesIcon,
		},
		content: {
			description: "Editorial building blocks that add structure, explanation, and context.",
			icon: LayoutTemplateIcon,
		},
		data: {
			description: "Operational views and record-driven ways to understand work.",
			icon: DatabaseIcon,
		},
		charts: {
			description: "Visual comparisons, distributions, composition, and change over time.",
			icon: ChartNoAxesCombinedIcon,
		},
		actions: {
			description: "Forms and workflow controls that let people take action from a page.",
			icon: MousePointerClickIcon,
		},
	};
	const categoryOptions = blockCategories.map((item) => ({ value: item.key, label: item.label }));
	let category = $state<BlockCategory>("highlights");
	const selectedCategory = $derived(blockCategories.find((item) => item.key === category) ?? blockCategories[0]);
	const selectedBlocks = $derived(blocks.filter((block) => block.category === category));

	function preloadCategory(key: BlockCategory) {
		for (const block of blocks) {
			if (block.category === key) preloadBlockAssets(block.key);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader title="Block library" description="Browse the visual building blocks available for your pages. Every example uses representative preview data." />

	<div class="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
		<div class="mb-5 lg:hidden">
			<AppSelect
				value={category}
				options={categoryOptions}
				onValueChange={(value) => (category = value as BlockCategory)}
			/>
		</div>

		<aside class="hidden border-r border-border/60 pr-5 lg:block">
			<div class="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-3">
				<p class="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Categories</p>
				<nav aria-label="Block categories" class="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1">
					{#each blockCategories as item (item.key)}
						{@const Icon = categoryDetails[item.key].icon}
						<Button
							variant={category === item.key ? "secondary" : "ghost"}
							class="w-full justify-start"
							aria-current={category === item.key ? "page" : undefined}
							onclick={() => (category = item.key)}
							onpointerenter={() => preloadCategory(item.key)}
							onfocus={() => preloadCategory(item.key)}
						>
							<Icon data-icon="inline-start" />
							{item.label}
							<Badge variant="secondary" class="ml-auto">
								{blocks.filter((block) => block.category === item.key).length}
							</Badge>
						</Button>
					{/each}
				</nav>
			</div>
		</aside>

		{#if selectedCategory}
			<section class="flex min-w-0 flex-col gap-4">
				<div class="flex items-end justify-between gap-4">
					<div class="flex flex-col gap-1">
						<h2 class="text-lg font-semibold">{selectedCategory.label}</h2>
						<p class="text-sm text-muted-foreground">{categoryDetails[selectedCategory.key].description}</p>
					</div>
					<p class="shrink-0 text-sm text-muted-foreground">{selectedBlocks.length} {selectedBlocks.length === 1 ? "block" : "blocks"}</p>
				</div>
				<div class="grid grid-flow-row-dense gap-4 xl:grid-cols-2">
					{#each selectedBlocks as block (block.key)}
						<BlockLibraryItem definition={block} wide={wide.has(block.key)} tall={tall.has(block.key)} />
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>
