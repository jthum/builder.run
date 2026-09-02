<script lang="ts">
	import { formatCell, isStatusPath } from "$lib/app/labels.ts";
	import StatusPill from "$lib/components/status-pill.svelte";

	let {
		path,
		value,
		href,
		badge = false,
		..._rest
	}: {
		path: string;
		value: unknown;
		href?: string;
		badge?: boolean;
		[key: string]: unknown;
	} = $props();

	const text = $derived(formatCell(path, value));
	const asStatus = $derived(badge || isStatusPath(path));
</script>

{#if href}
	<a class="font-medium hover:underline" {href}>{text === "—" ? "Open" : text}</a>
{:else if asStatus && text !== "—"}
	<StatusPill {path} {value} />
{:else}
	<span class={text === "—" ? "text-muted-foreground" : undefined}>{text}</span>
{/if}
