<script lang="ts">
	import { formatCell, isStatusPath } from "$lib/app/labels.ts";
	import RatingValue from "$lib/components/rating-value.svelte";
	import StatusPill from "$lib/components/status-pill.svelte";
	import type { CollectionDraft } from "@jthum/framework/svelte/studio";
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
		type?: CollectionDraft;
		maximumFractionDigits?: number;
		clamp?: boolean;
		ratingMax?: number;
	} = $props();

	const asStatus = $derived(badge || isStatusPath(path));
	const field = $derived(path.includes(".") ? undefined : type?.fields.find((item) => item.key === path));
	const text = $derived(formatFieldValue(field, path, value, maximumFractionDigits));
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

	function formatFieldValue(
		field: CollectionDraft["fields"][number] | undefined,
		path: string,
		value: unknown,
		maximumFractionDigits?: number,
	): string {
		if (value == null || value === "") return "—";
		if (field?.format === "currency" && field.currency) {
			const numeric = Number(value);
			if (!Number.isNaN(numeric)) {
				return new Intl.NumberFormat(undefined, {
					style: "currency",
					currency: field.currency,
					maximumFractionDigits: maximumFractionDigits ?? (numeric % 1 === 0 ? 0 : 2),
				}).format(numeric);
			}
		}
		if (field?.format === "percentage") {
			const numeric = Number(value);
			if (!Number.isNaN(numeric)) return `${numeric.toLocaleString()}%`;
		}
		if (field?.type === "datetime" && typeof value === "string") {
			const date = new Date(value);
			if (!Number.isNaN(date.getTime())) {
				return date.toLocaleString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "numeric",
					minute: "2-digit",
				});
			}
		}
		return formatCell(path, value, { maximumFractionDigits });
	}
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
