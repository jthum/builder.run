<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	let { values, rows, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const record = $derived(rows[viewKey]?.[0]);
	const titleField = $derived(String(values.title_field ?? view?.fields[0] ?? "id"));
	const descriptionField = $derived(String(values.description_field ?? ""));
	const statusField = $derived(String(values.status_field ?? ""));
</script>

{#if view && record}
	<Card.Root class="h-full">
		<Card.Header><Card.Title>{String(values.title || `Featured ${type?.label ?? "record"}`)}</Card.Title>{#if statusField}<Card.Action><FormattedValue path={statusField} value={record[statusField]} {type} badge /></Card.Action>{/if}</Card.Header>
		<Card.Content class="flex min-h-40 flex-col justify-center gap-3">
			<p class="text-2xl font-semibold tracking-tight"><FormattedValue path={titleField} value={record[titleField]} {type} /></p>
			{#if descriptionField}<p class="max-w-2xl text-muted-foreground"><FormattedValue path={descriptionField} value={record[descriptionField]} {type} /></p>{/if}
		</Card.Content>
		<Card.Footer class="justify-end"><Button href={`/t/${view.source}/${record.id}`} variant="ghost" size="sm">{String(values.action_label || "Open record")}<ArrowRightIcon data-icon="inline-end" /></Button></Card.Footer>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">This spotlight needs a view with at least one record.</p>{/if}
