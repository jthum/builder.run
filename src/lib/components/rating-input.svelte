<script lang="ts">
	import * as ToggleGroup from "@jthum/framework/svelte/ui/toggle-group";

	let {
		value = $bindable(),
		max = 10,
		label = "Rating",
		required = false,
		disabled = false,
	}: {
		value: unknown;
		max?: number;
		label?: string;
		required?: boolean;
		disabled?: boolean;
	} = $props();

	const limit = $derived(Math.min(10, Math.max(2, Math.round(max))));
	const options = $derived(Array.from({ length: limit }, (_, index) => index + 1));
	const selected = $derived(value == null || value === "" ? "" : String(value));

	function select(next: string) {
		value = next ? Number(next) : "";
	}
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	size="sm"
	class="max-w-full flex-wrap"
	value={selected}
	onValueChange={select}
	aria-label={label}
	aria-required={required}
	{disabled}
>
	{#each options as option (option)}
		<ToggleGroup.Item
			value={String(option)}
			aria-label={`${label}: ${option} out of ${limit}`}
			class="data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:ring-2 data-[state=on]:ring-primary/20"
		>
			{option}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
