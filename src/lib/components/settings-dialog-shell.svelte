<script lang="ts">
	import * as Dialog from "@jthum/framework/svelte/ui/dialog";
	import * as Tabs from "@jthum/framework/svelte/ui/tabs";
	import { cn } from "$lib/utils.js";
	import type { Component, Snippet } from "svelte";

	export type SettingsDialogSection = {
		value: string;
		label: string;
		icon: Component;
	};

	let {
		open,
		section = $bindable(),
		title,
		description,
		sections,
		onOpenChange,
		onSubmit,
		children,
		actions,
	}: {
		open: boolean;
		section: string;
		title: string;
		description: string;
		sections: SettingsDialogSection[];
		onOpenChange: (open: boolean) => void;
		onSubmit: (event: SubmitEvent) => void | Promise<void>;
		children: Snippet;
		actions: Snippet;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="max-h-[calc(100vh-2rem)] sm:min-h-[36rem] sm:max-w-4xl">
		<form onsubmit={onSubmit}>
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="flex overflow-hidden bg-card p-0">
				<Tabs.Root bind:value={section} orientation="vertical" class={cn("min-h-0 flex-1 flex-col gap-0", sections.length > 1 && "sm:grid sm:grid-cols-[12rem_minmax(0,1fr)]")}>
					{#if sections.length > 1}
						<Tabs.List variant="rail" class="h-auto w-full shrink-0 items-stretch justify-start gap-1 rounded-none border-b border-border/60 bg-card p-3 sm:h-full sm:border-r sm:border-b-0">
							{#each sections as item (item.value)}
								{@const Icon = item.icon}
								<Tabs.Trigger value={item.value} class="h-9 w-full flex-none justify-start px-3">
									<Icon data-icon="inline-start" />
									{item.label}
								</Tabs.Trigger>
							{/each}
						</Tabs.List>
					{/if}
					{@render children()}
				</Tabs.Root>
			</Dialog.Body>
			<Dialog.Footer>
				{@render actions()}
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
