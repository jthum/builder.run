<script lang="ts">
	let { id, index, color }: { id: string; index: number; color: string } = $props();
</script>

<pattern {id} width="8" height="8" patternUnits="userSpaceOnUse">
	<rect width="8" height="8" fill={color} class="pattern-base" />
	<g class="pattern-ink" fill="none" stroke="var(--background)" opacity="0.24" stroke-width="0.75">
		{#if index % 6 === 0}<path d="M-2 2 2-2 M0 8 8 0 M6 10 10 6" />
		{:else if index % 6 === 1}<circle cx="4" cy="4" r="0.85" fill="var(--background)" stroke="none" />
		{:else if index % 6 === 2}<path d="M0 4H8" />
		{:else if index % 6 === 3}<path d="M0 0 8 8 M0 8 8 0" />
		{:else if index % 6 === 4}<path d="M4 0V8" />
		{:else}<path d="M0 4H8 M4 0V8" />{/if}
	</g>
</pattern>

<style>
	@media (forced-colors: active) {
		.pattern-base { fill: Canvas; }
		.pattern-ink { stroke: CanvasText; opacity: 1; stroke-width: 1.25; }
		.pattern-ink :global(circle) { fill: CanvasText; }
	}
</style>
