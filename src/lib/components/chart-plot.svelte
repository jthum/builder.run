<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		children,
	}: {
		children: Snippet<[{ width: number; height: number }]>;
	} = $props();

	let node = $state<HTMLDivElement | null>(null);
	let width = $state(0);
	let height = $state(0);

	$effect(() => {
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			const box = entries[0]?.contentRect;
			if (!box) return;
			width = Math.max(0, Math.floor(box.width));
			height = Math.max(0, Math.floor(box.height));
		});
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

<div bind:this={node} class="relative min-h-40 w-full flex-1">
	{#if width > 16 && height > 16}
		{@render children({ width, height })}
	{/if}
</div>
