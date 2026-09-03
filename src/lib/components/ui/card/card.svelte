<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: "default" | "sm" } = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	data-size={size}
	class={cn(
		"group/card flex h-full flex-col gap-[2px] overflow-hidden rounded-2xl bg-muted p-[2px] text-sm text-card-foreground ring-1 ring-foreground/10 has-[>img:first-child]:p-0 [--chrome:2px] [--frame-radius:var(--radius-2xl)] data-[size=sm]:rounded-xl data-[size=sm]:[--frame-radius:var(--radius-xl)]",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
