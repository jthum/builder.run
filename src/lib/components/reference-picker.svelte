<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Command from "$lib/components/ui/command/index.js";
	import * as Popover from "$lib/components/ui/popover/index.js";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";

	let {
		value = $bindable(""),
		options,
		placeholder = "Select",
	}: {
		value?: string;
		options: Array<{ id: string; label: string }>;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	const selected = $derived(options.find((option) => option.id === value));
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" class="w-full justify-between" {...props}>
				<span class="truncate">{selected?.label ?? placeholder}</span>
				<ChevronsUpDownIcon data-icon="inline-end" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root>
			<Command.Input placeholder="Search…" />
			<Command.List>
				<Command.Empty>No matches.</Command.Empty>
				<Command.Group>
					<Command.Item
						onSelect={() => {
							value = "";
							open = false;
						}}>None</Command.Item
					>
					{#each options as option (option.id)}
						<Command.Item
							value={`${option.label} ${option.id}`}
							onSelect={() => {
								value = option.id;
								open = false;
							}}>{option.label}</Command.Item
						>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
