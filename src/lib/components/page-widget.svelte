<script lang="ts">
	import { collectionLabel, listHref } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import RecordForm from "$lib/components/record-form.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import StatCard from "$lib/components/stat-card.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import CalendarMonth from "$lib/components/calendar-month.svelte";
	import CalloutWidget from "$lib/components/callout-widget.svelte";
	import ChartMark from "$lib/components/chart-mark.svelte";
	import KanbanBoard from "$lib/components/kanban-board.svelte";
	import MetricWidget from "$lib/components/metric-widget.svelte";
	import ViewCards from "$lib/components/view-cards.svelte";
	import ViewList from "$lib/components/view-list.svelte";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	let {
		block,
		rows,
		ready = true,
	}: {
		block: PageBlock;
		rows: Record<string, Array<Record<string, unknown>>>;
		ready?: boolean;
	} = $props();

	const spec = $derived(session.snapshot?.spec);
	const values = $derived(block.kind === "widget" ? (block.values ?? {}) : {});
	const widget = $derived(block.kind === "widget" ? block.widget : "");
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const form = $derived(spec?.forms.find((item) => item.key === String(values.form ?? "")));
	const formType = $derived(spec?.types.find((item) => item.key === form?.type));
	const viewRows = $derived(viewKey ? (rows[viewKey] ?? []) : []);
	const caption = $derived(String(values.title || view?.label || ""));

	async function runWorkflow() {
		const workflow = String(values.workflow ?? "");
		if (!workflow) return;
		await runtime().invoke(workflow, {});
		toast.success(String(values.label || "Done"));
	}
</script>

{#if widget === "heading"}
	<div class="flex flex-col gap-1">
		<h2 class="text-lg font-medium">{String(values.title ?? "Heading")}</h2>
		{#if values.description}
			<p class="max-w-2xl text-muted-foreground">{String(values.description)}</p>
		{/if}
	</div>
{:else if widget === "text"}
	<p class="max-w-2xl text-muted-foreground whitespace-pre-wrap">{String(values.text ?? "")}</p>
{:else if widget === "stat" && view}
	<StatCard
		label={caption || view.label}
		count={viewRows.length}
		description={String(values.description ?? "").trim()}
		href={listHref(view)}
		{ready}
	/>
{:else if widget === "table" && view}
	<RecordTable
		rows={ready ? viewRows : null}
		{view}
		typeKey={view.source}
		title={caption || view.label}
		compact={Boolean(values.compact)}
		actionHref={listHref(view)}
		actionLabel="View all"
		createHref={values.compact ? undefined : `/t/${view.source}/new`}
	/>
{:else if widget === "cards" && view}
	<ViewCards rows={ready ? viewRows : null} {view} {type} />
{:else if widget === "list" && view}
	<ViewList rows={ready ? viewRows : null} {view} {type} />
{:else if widget === "form" && form && (form.mode === "standalone" || formType)}
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>{String(values.title || form.label)}</Card.Title>
		</Card.Header>
		<Card.Content>
			<RecordForm type={formType} {form} fields={form.fields} fullWidth />
		</Card.Content>
	</Card.Root>
{:else if widget === "action"}
	<Button onclick={runWorkflow}>{String(values.label || "Run")}</Button>
{:else if widget === "callout"}
	<CalloutWidget
		title={String(values.title ?? "Note")}
		text={String(values.text ?? "")}
		tone={String(values.tone ?? "note")}
	/>
{:else if widget === "metric" && view}
	<MetricWidget
		title={caption || view.label}
		rows={ready ? viewRows : null}
		value={String(values.value ?? "")}
		date={String(values.date ?? "created_at")}
		description={String(values.description ?? "").trim()}
		context={view.group_by || !type ? "" : `Across ${viewRows.length} ${(viewRows.length === 1 ? type.label : collectionLabel(type)).toLocaleLowerCase()}`}
		href={listHref(view)}
		{ready}
	/>
{:else if widget === "kanban" && view}
	<KanbanBoard
		{view}
		{type}
		title={caption}
		field={String(values.field ?? "")}
		rows={ready ? viewRows : null}
		{ready}
	/>
{:else if widget === "calendar" && view}
	<CalendarMonth
		{view}
		{type}
		title={caption}
		dateField={String(values.date ?? "")}
		rows={ready ? viewRows : null}
		{ready}
	/>
{:else if (widget === "bar" || widget === "line" || widget === "donut" || widget === "stacked_bar") && view}
	<ChartMark
		mark={widget === "stacked_bar" ? "stacked" : widget}
		title={caption || view.label}
		rows={ready ? viewRows : null}
		category={String(values.category ?? "")}
		value={String(values.value ?? "")}
		series={String(values.series ?? "")}
		time={widget === "line"}
		{ready}
	/>
{:else if widget === "stat" || widget === "table" || widget === "cards" || widget === "list" || widget === "bar" || widget === "line" || widget === "donut" || widget === "stacked_bar" || widget === "metric" || widget === "kanban" || widget === "calendar"}
	<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>
{:else if widget === "form"}
	<p class="text-sm text-muted-foreground">Pick a form for this widget.</p>
{:else if widget}
	<p class="text-sm text-muted-foreground">This widget isn't available yet.</p>
{/if}
