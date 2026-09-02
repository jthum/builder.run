<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import {
		widgetCategories,
		widgets,
		type WidgetDef,
	} from "$lib/runtime/widgets.ts";
	import CheckIcon from "@lucide/svelte/icons/check";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import HashIcon from "@lucide/svelte/icons/hash";
	import HeadingIcon from "@lucide/svelte/icons/heading";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import ListIcon from "@lucide/svelte/icons/list";
	import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";
	import SearchIcon from "@lucide/svelte/icons/search";
	import TableIcon from "@lucide/svelte/icons/table";
	import TextIcon from "@lucide/svelte/icons/text";
	import type { Component } from "svelte";

	let {
		open = $bindable(false),
		onPick,
	}: {
		open?: boolean;
		onPick: (widget: WidgetDef) => void;
	} = $props();

	const icons: Record<string, Component> = {
		heading: HeadingIcon,
		text: TextIcon,
		stat: HashIcon,
		table: TableIcon,
		cards: LayoutGridIcon,
		list: ListIcon,
		form: FormInputIcon,
		action: MousePointerClickIcon,
	};

	let query = $state("");
	let category = $state("all");
	let selected = $state("heading");

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return widgets.filter((item) => {
			if (category !== "all" && item.category !== category) return false;
			if (!needle) return true;
			return `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(needle);
		});
	});
	const chosen = $derived(widgets.find((item) => item.key === selected) ?? filtered[0]);

	$effect(() => {
		if (!open) return;
		query = "";
		category = "all";
		selected = "heading";
	});

	function submit(event: Event) {
		event.preventDefault();
		if (!chosen) return;
		onPick(chosen);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[min(44rem,calc(100vh-2rem))] overflow-hidden sm:max-w-3xl">
		<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Add widget</Dialog.Title>
				<Dialog.Description>
					Widgets take values and render. Some are copy. Some attach to a view.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-sm font-medium">Choose a widget</p>
					<InputGroup.Root class="sm:max-w-64">
						<InputGroup.Addon>
							<SearchIcon />
						</InputGroup.Addon>
						<InputGroup.Input bind:value={query} placeholder="Filter widgets" />
					</InputGroup.Root>
				</div>
				<ToggleGroup.Root type="single" bind:value={category} variant="outline" size="sm">
					<ToggleGroup.Item value="all">All</ToggleGroup.Item>
					{#each widgetCategories as item (item.key)}
						<ToggleGroup.Item value={item.key}>{item.label}</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
				<div class="min-h-0 flex-1 overflow-y-auto pr-1">
					<div class="grid gap-3 sm:grid-cols-2">
						{#each filtered as item (item.key)}
							{@const Icon = icons[item.key] ?? LayoutGridIcon}
							<button
								type="button"
								class="flex flex-col gap-2 rounded-2xl border p-4 text-start transition-colors hover:bg-muted/40 {selected ===
								item.key
									? 'border-primary ring-2 ring-primary/20'
									: 'border-border'}"
								data-testid="widget-template"
								data-widget={item.key}
								onclick={() => (selected = item.key)}
							>
								<div class="flex items-start justify-between gap-2">
									<div class="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
										<Icon />
									</div>
									{#if selected === item.key}
										<CheckIcon class="size-4 text-primary" />
									{/if}
								</div>
								<div class="font-medium">{item.label}</div>
								<p class="text-sm text-muted-foreground">{item.description}</p>
							</button>
						{/each}
					</div>
					{#if !filtered.length}
						<p class="py-8 text-center text-sm text-muted-foreground">No widgets match that filter.</p>
					{/if}
				</div>
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={!chosen} data-testid="insert-widget">Add widget</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
