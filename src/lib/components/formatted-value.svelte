<script lang="ts">
	import { formatCell, isStatusPath } from "$lib/app/labels.ts";
	import StatusPill from "$lib/components/status-pill.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import type { TypeDef } from "$lib/runtime/model.ts";

	let {
		path,
		value,
		href,
		badge = false,
		type,
	}: {
		path: string;
		value: unknown;
		href?: string;
		badge?: boolean;
		type?: TypeDef;
	} = $props();

	const text = $derived(formatCell(path, value));
	const asStatus = $derived(badge || isStatusPath(path));
	const field = $derived(path.includes(".") ? undefined : type?.fields.find((item) => item.key === path));
	const asRating = $derived(field?.type === "number" && field.presentation === "rating");
	const rating = $derived(`${text} / ${field?.max ?? 10}`);
</script>

{#if href}
	<a class="font-medium hover:underline" {href}>{text === "—" ? "Open" : asRating ? rating : text}</a>
{:else if asStatus && text !== "—"}
	<StatusPill {path} {value} />
{:else if asRating && text !== "—"}
	<Badge variant="secondary" class="tabular-nums">{rating}</Badge>
{:else}
	<span class={text === "—" ? "text-muted-foreground" : undefined}>{text}</span>
{/if}
