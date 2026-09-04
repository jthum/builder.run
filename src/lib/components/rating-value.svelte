<script lang="ts">
	import { cn } from "$lib/utils.ts";

	let { value, text, max }: { value: unknown; text: string; max: number } = $props();

	const numeric = $derived(typeof value === "number" ? value : Number(value));
	const ratio = $derived(Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric / max)) : 0);
	const percent = $derived(Math.round(ratio * 100));
	const tone = $derived(
		ratio >= 0.8
			? "bg-emerald-500"
			: ratio >= 0.6
				? "bg-sky-500"
				: ratio >= 0.4
					? "bg-amber-500"
					: "bg-red-500",
	);
</script>

<span
	class="inline-flex w-28 items-center justify-end gap-2"
	aria-label={`${text} out of ${max}, ${percent}%`}
	title={`${text} out of ${max} (${percent}%)`}
>
	<span class="inline-flex min-w-16 items-baseline justify-end whitespace-nowrap text-end tabular-nums">
		<span class="font-semibold text-foreground">{text}</span>
		<span class="text-xs text-muted-foreground"> / {max}</span>
	</span>
	<span class="h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden="true">
		<span class={cn("block h-full rounded-full", tone)} style={`width: ${percent}%`}></span>
	</span>
</span>
