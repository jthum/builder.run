<script lang="ts">
	import ChartPattern from "./chart-pattern.svelte";
	import { chartDash } from "$lib/runtime/chart-interaction.svelte.ts";
	let { color, index, line = false, plain = false }: { color: string; index: number; line?: boolean; plain?: boolean } = $props();
	const id = $props.id();
</script>

<svg width={line ? 28 : 16} height="16" viewBox={line ? "0 0 28 16" : "0 0 16 16"} class="shrink-0" aria-hidden="true">
	{#if line}
		<path d="M0 8H28" stroke={color} stroke-width="2" stroke-dasharray={chartDash(index)} />
		<circle cx="14" cy="8" r="3" fill={color} stroke="var(--background)" />
	{:else}
		<defs><ChartPattern {id} {index} {color} /></defs>
		<rect x="1" y="1" width="14" height="14" rx="3" fill={plain ? color : `url(#${id})`} stroke="var(--foreground)" stroke-opacity="0.25" />
	{/if}
</svg>
