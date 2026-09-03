<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-content"
	class={cn(
		"flex-1 rounded-[calc(var(--frame-radius)-var(--chrome))] bg-background px-4 py-3 text-foreground group-has-data-[slot=card-header]/card:rounded-t-none group-has-data-[slot=card-footer]/card:rounded-b-none group-data-[size=sm]/card:px-3 group-data-[size=sm]/card:py-2.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
