<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Command from "$lib/components/ui/command/index.js";
	import * as Popover from "$lib/components/ui/popover/index.js";
	import { cn } from "$lib/utils.js";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";

	let {
		value = $bindable(),
		options,
		placeholder = "Select",
		disabled = false,
		required = false,
	}: {
		value?: string;
		options: Array<{ id: string; label: string }>;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
	} = $props();

	let open = $state(false);
	let search = $state("");
	let remembered = $state<{ id: string; label: string } | null>(null);

	const selected = $derived(options.find((option) => option.id === value));
	const display = $derived(
		selected ?? (remembered?.id === value && value ? remembered : undefined),
	);
	const needle = $derived(search.trim().toLowerCase());
	const filtered = $derived(
		needle
			? options.filter(
					(option) =>
						option.label.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle),
				)
			: options,
	);

	$effect(() => {
		if (selected) remembered = selected;
	});

	$effect(() => {
		if (open) search = "";
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				variant="outline"
				{...props}
				class="w-full justify-between font-normal"
				role="combobox"
				aria-expanded={open}
				aria-required={required}
				{disabled}
			>
				<span
					class={cn(
						"min-w-0 flex-1 truncate text-start",
						display ? "" : "text-muted-foreground",
					)}>{display?.label ?? placeholder}</span
				>
				<ChevronsUpDownIcon data-icon="inline-end" class="text-muted-foreground" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input bind:value={search} placeholder="Search…" />
			<Command.List>
				<Command.Empty>{options.length ? "No matches." : "Nothing to choose yet."}</Command.Empty>
				<Command.Group>
					{#if !needle}
						<Command.Item
							value="none"
							onSelect={() => {
								value = "";
								open = false;
							}}>None</Command.Item
						>
					{/if}
					{#each filtered as option (option.id)}
						<Command.Item
							value={`${option.label} ${option.id}`}
							onSelect={() => {
								value = option.id;
								remembered = option;
								open = false;
							}}>{option.label}</Command.Item
						>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
