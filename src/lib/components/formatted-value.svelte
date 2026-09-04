<script lang="ts">
	import { formatCell, isStatusPath } from "$lib/app/labels.ts";
	import RatingValue from "$lib/components/rating-value.svelte";
	import StatusPill from "$lib/components/status-pill.svelte";
	import type { TypeDef } from "$lib/runtime/model.ts";
	import { cn } from "$lib/utils.ts";

	let {
		path,
		value,
		href,
		badge = false,
		type,
		maximumFractionDigits,
		clamp = false,
		ratingMax,
	}: {
		path: string;
		value: unknown;
		href?: string;
		badge?: boolean;
		type?: TypeDef;
		maximumFractionDigits?: number;
		clamp?: boolean;
		ratingMax?: number;
	} = $props();

	const text = $derived(formatCell(path, value, { maximumFractionDigits }));
	const asStatus = $derived(badge || isStatusPath(path));
	const field = $derived(path.includes(".") ? undefined : type?.fields.find((item) => item.key === path));
	const enumTone = $derived(
		field?.type === "enum" && field.presentation === "badge"
			? (field.value_semantics?.[String(value ?? "")] ?? "neutral")
			: undefined,
	);
	const asPill = $derived(asStatus || enumTone !== undefined);
	const ratingMaximum = $derived(
		ratingMax ??
			(field?.type === "number" && field.presentation === "rating" ? (field.max ?? 10) : undefined),
	);
	const asRating = $derived(ratingMaximum !== undefined);
	const textClass = $derived(clamp ? "line-clamp-2 max-w-sm whitespace-normal break-words" : undefined);
	const fullText = $derived(clamp && typeof value === "string" ? value : undefined);
</script>

{#if href}
	<a class={cn("font-medium hover:underline", textClass)} {href} title={fullText}>
		{#if asPill && text !== "—"}
			<StatusPill {path} {value} tone={enumTone} />
		{:else if asRating && text !== "—"}
			<RatingValue {value} text={text} max={ratingMaximum ?? 10} />
		{:else}
			{text === "—" ? "Open" : text}
		{/if}
	</a>
{:else if asPill && text !== "—"}
	<StatusPill {path} {value} tone={enumTone} />
{:else if asRating && text !== "—"}
	<RatingValue {value} text={text} max={ratingMaximum ?? 10} />
{:else}
	<span class={cn(text === "—" && "text-muted-foreground", textClass)} title={fullText}>{text}</span>
{/if}
