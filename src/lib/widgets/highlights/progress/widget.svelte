<script lang="ts">
	import { listHref } from "$lib/app/labels.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Progress } from "$lib/components/ui/progress/index.js";
	import { asNumber, cellValue } from "$lib/runtime/chart-data.ts";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";
	let { values, rows, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const target = $derived(Math.max(0, asNumber(values.target)));
	const total = $derived((rows[viewKey] ?? []).reduce((sum, row) => sum + (values.value ? asNumber(cellValue(row, String(values.value))) : 1), 0));
	const percent = $derived(target > 0 ? Math.min(100, Math.max(0, (total / target) * 100)) : 0);
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0"><Card.Title>{String(values.title || view.label)}</Card.Title><Card.Description>{String(values.description || `${Math.round(percent)}% complete`)}</Card.Description><Card.Action><Button href={listHref(view)} variant="ghost" size="icon-sm" aria-label={`Open ${view.label}`}><ArrowUpRightIcon /></Button></Card.Action></Card.Header>
		<Card.Content class="flex flex-col justify-center gap-4">
			<div class="flex items-end justify-between gap-4"><p class="text-3xl font-semibold tracking-tight tabular-nums">{total.toLocaleString()}</p><p class="text-sm text-muted-foreground tabular-nums">of {target.toLocaleString()}</p></div>
			<Progress value={percent} max={100} />
		</Card.Content>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
