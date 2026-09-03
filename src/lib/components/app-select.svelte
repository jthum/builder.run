<script lang="ts">
	import * as Select from "$lib/components/ui/select/index.js";
	import { cn } from "$lib/utils.js";

	const empty = "__empty__";

	let {
		value = $bindable(),
		options,
		placeholder = "Select",
		class: className,
		disabled = false,
	}: {
		value?: string;
		options: Array<{ value: string; label: string }>;
		placeholder?: string;
		class?: string;
		disabled?: boolean;
	} = $props();

	const items = $derived(
		options.map((option) => ({
			value: option.value === "" ? empty : option.value,
			label: option.label,
		})),
	);
	const selected = $derived(options.find((option) => option.value === (value ?? "")));
</script>

<Select.Root
	type="single"
	value={value ? value : empty}
	onValueChange={(next) => {
		value = next === empty ? "" : next;
	}}
	{disabled}
	allowDeselect={false}
	{items}
>
	<Select.Trigger class={cn("w-full", className)}>
		<span class={selected ? "" : "text-muted-foreground"}>{selected?.label ?? placeholder}</span>
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			{#each items as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>
