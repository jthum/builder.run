<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { Snippet } from "svelte";

	let {
		open = $bindable(false),
		title,
		description,
		total,
		rangeStart,
		rangeEnd,
		selectedLabel,
		canGoBack,
		canGoForward,
		onBack,
		onForward,
		onSubmit,
		categories,
		toolbar,
		children,
		actions,
	}: {
		open?: boolean;
		title: string;
		description: string;
		total: number;
		rangeStart: number;
		rangeEnd: number;
		selectedLabel?: string;
		canGoBack: boolean;
		canGoForward: boolean;
		onBack: () => void;
		onForward: () => void;
		onSubmit: (event: SubmitEvent) => void | Promise<void>;
		categories: Snippet;
		toolbar: Snippet;
		children: Snippet;
		actions: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="h-[min(44rem,calc(100vh-2rem))] overflow-hidden sm:max-w-5xl">
		<form class="flex min-h-0 flex-1 flex-col" onsubmit={onSubmit}>
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-card p-0 sm:grid-cols-[15rem_minmax(0,1fr)] sm:grid-rows-1">
				<aside class="flex gap-1 overflow-x-auto border-b border-border/60 bg-card p-3 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0">
					{@render categories()}
				</aside>
				<div class="flex min-h-0 flex-col gap-3 bg-card p-5">
					{@render toolbar()}
					<div class="flex items-center justify-between px-0.5">
						<p class="text-xs font-medium text-muted-foreground">{total} {total === 1 ? "template" : "templates"}</p>
						{#if selectedLabel}<p class="text-xs text-muted-foreground">Selected: <span class="font-medium text-foreground">{selectedLabel}</span></p>{/if}
					</div>
					<div class="min-h-0 flex-1 overflow-y-auto pr-1">
						{@render children()}
					</div>
				</div>
			</Dialog.Body>
			<Dialog.Footer class="sm:justify-between">
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<span>{rangeStart}–{rangeEnd} of {total}</span>
					<div class="flex items-center gap-1">
						<Button type="button" variant="outline" size="icon-sm" aria-label="Previous page" disabled={!canGoBack} onclick={onBack}><ChevronLeftIcon /></Button>
						<Button type="button" variant="outline" size="icon-sm" aria-label="Next page" disabled={!canGoForward} onclick={onForward}><ChevronRightIcon /></Button>
					</div>
				</div>
				<div class="flex items-center gap-2">{@render actions()}</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
