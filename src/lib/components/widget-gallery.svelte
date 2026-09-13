<script lang="ts">
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import PageWidget from "$lib/components/page-widget.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import { sampleApps } from "$lib/runtime/samples.ts";
	import { widgetCategories, widgets, type WidgetCategory } from "$lib/runtime/widgets.ts";
	import { preloadWidgetRenderer } from "$lib/widgets/registry.ts";
	import ChartNoAxesCombinedIcon from "@lucide/svelte/icons/chart-no-axes-combined";
	import DatabaseIcon from "@lucide/svelte/icons/database";
	import LayoutTemplateIcon from "@lucide/svelte/icons/layout-template";
	import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import type { Component } from "svelte";

	const previewSpec = sampleApps.find((sample) => sample.key === "project_tracker")!.spec;
	const projects = [
		{ id: "project-1", name: "Website launch", "client.name": "Northwind", status: "active", priority: "critical", budget: 12000, due_date: "2026-09-18", created_at: "2026-07-04" },
		{ id: "project-2", name: "Brand audit", "client.name": "Northwind", status: "planned", priority: "medium", budget: 4000, due_date: "2026-10-02", created_at: "2026-07-22" },
		{ id: "project-3", name: "Autumn campaign", "client.name": "Contoso Labs", status: "active", priority: "high", budget: 18500, due_date: "2026-10-14", created_at: "2026-08-08" },
	];
	const tasks = [
		{ id: "task-1", title: "Approve final homepage copy", "project.name": "Website launch", assignee: "Maya", priority: "critical", status: "blocked", estimate: 3, due_date: "2026-09-08" },
		{ id: "task-2", title: "Run accessibility pass", "project.name": "Website launch", assignee: "Jon", priority: "high", status: "doing", estimate: 6, due_date: "2026-09-11" },
		{ id: "task-3", title: "Configure production analytics", "project.name": "Website launch", assignee: "Iris", priority: "medium", status: "todo", estimate: 4, due_date: "2026-09-15" },
		{ id: "task-4", title: "Inventory brand touchpoints", "project.name": "Brand audit", assignee: "Maya", priority: "medium", status: "done", estimate: 8, due_date: "2026-09-22" },
	];
	const groupedTasks = [
		{ id: "status-1", status: "todo", task_count: 5, estimated_hours: 21 },
		{ id: "status-2", status: "doing", task_count: 3, estimated_hours: 14 },
		{ id: "status-3", status: "blocked", task_count: 2, estimated_hours: 7 },
		{ id: "status-4", status: "done", task_count: 8, estimated_hours: 32 },
	];
	const rows = {
		project_portfolio: projects,
		active_projects: projects.filter((project) => project.status === "active"),
		all_tasks: tasks,
		blocked_tasks: tasks.filter((task) => task.status === "blocked"),
		tasks_by_status: groupedTasks,
	};

	const examples: Record<string, Record<string, unknown>> = {
		hero: { eyebrow: "Delivery command centre", title: "Make this week count", description: "Bring active work, emerging risks, and the next decisions into one calm operating view.", badge: "Week 37", primary_label: "Review projects", primary_href: "/v/active_projects", secondary_label: "Add a task", secondary_href: "/t/task/new" },
		progress: { view: "project_portfolio", title: "Budget committed", value: "budget", target: 50000, description: "Toward this quarter's delivery plan" },
		spotlight: { view: "active_projects", title_field: "name", description_field: "client.name", status_field: "status", action_label: "Open project" },
		activity_feed: { view: "all_tasks", title: "Upcoming activity", title_field: "title", description_field: "project.name", date_field: "due_date", limit: 4 },
		section_heading: { eyebrow: "Portfolio", title: "Work in motion", description: "A shared view of delivery across clients and teams.", action_label: "View all", action_href: "/v/project_portfolio" },
		quick_actions: { title: "Move work forward", description: "Common actions for the delivery team.", first_workflow: "complete_project", first_label: "Complete project", second_workflow: "complete_task", second_label: "Complete task" },
		heading: { title: "Quarterly operations", description: "The work, risks, and decisions that need attention this week." },
		text: { text: "Keep the team aligned around outcomes. Use this space for context that makes the data below easier to act on." },
		callout: { title: "Review needed", text: "Two blocked tasks need an owner before Friday.", tone: "warning" },
		stat: { view: "active_projects", title: "Active projects", description: "Across the current portfolio" },
		metric: { view: "project_portfolio", title: "Portfolio budget", value: "budget", date: "due_date", description: "Planned client investment" },
		table: { view: "active_projects", title: "Active projects", compact: true },
		cards: { view: "project_portfolio", title: "Project portfolio" },
		list: { view: "all_tasks", title: "Upcoming work" },
		bar: { view: "tasks_by_status", title: "Estimated hours", category: "status", value: "estimated_hours" },
		line: { view: "project_portfolio", title: "Budget over time", category: "due_date", value: "budget" },
		donut: { view: "tasks_by_status", title: "Work by status", category: "status", value: "task_count" },
		stacked_bar: { view: "all_tasks", title: "Workload by owner", category: "assignee", series: "status", value: "estimate" },
		kanban: { view: "all_tasks", title: "Delivery board", field: "status" },
		calendar: { view: "all_tasks", title: "Delivery calendar", date: "due_date" },
		form: { form: "quick_task", title: "Add a task" },
		action: { workflow: "complete_project", label: "Complete project" },
	};

	const wide = new Set(["hero", "section_heading", "table", "cards", "kanban", "calendar", "form"]);
	const tall = new Set(["bar", "line", "donut", "stacked_bar", "kanban", "calendar"]);
	const categoryDetails: Record<WidgetCategory, { description: string; icon: Component }> = {
		highlights: {
			description: "Prominent summaries and signals that establish the purpose of a page.",
			icon: SparklesIcon,
		},
		content: {
			description: "Editorial building blocks that add structure, explanation, and context.",
			icon: LayoutTemplateIcon,
		},
		data: {
			description: "Operational views and record-driven ways to understand work.",
			icon: DatabaseIcon,
		},
		charts: {
			description: "Visual comparisons, distributions, composition, and change over time.",
			icon: ChartNoAxesCombinedIcon,
		},
		actions: {
			description: "Forms and workflow controls that let people take action from a page.",
			icon: MousePointerClickIcon,
		},
	};
	const categoryOptions = widgetCategories.map((item) => ({ value: item.key, label: item.label }));
	let category = $state<WidgetCategory>("highlights");
	const selectedCategory = $derived(widgetCategories.find((item) => item.key === category) ?? widgetCategories[0]);
	const selectedWidgets = $derived(widgets.filter((widget) => widget.category === category));

	function block(key: string): PageBlock {
		return { kind: "widget", widget: key, values: examples[key] ?? {} };
	}

	function preloadCategory(key: WidgetCategory) {
		for (const widget of widgets) {
			if (widget.category === key) preloadWidgetRenderer(widget.key);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader title="Widget gallery" description="A development reference for every page widget, rendered with deterministic mock data." />

	<div class="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
		<div class="mb-5 lg:hidden">
			<AppSelect
				value={category}
				options={categoryOptions}
				onValueChange={(value) => (category = value as WidgetCategory)}
			/>
		</div>

		<aside class="hidden border-r border-border/60 pr-5 lg:block">
			<div class="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-3">
				<p class="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Categories</p>
				<nav aria-label="Widget categories" class="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1">
					{#each widgetCategories as item (item.key)}
						{@const Icon = categoryDetails[item.key].icon}
						<Button
							variant={category === item.key ? "secondary" : "ghost"}
							class="w-full justify-start"
							aria-current={category === item.key ? "page" : undefined}
							onclick={() => (category = item.key)}
							onpointerenter={() => preloadCategory(item.key)}
							onfocus={() => preloadCategory(item.key)}
						>
							<Icon data-icon="inline-start" />
							{item.label}
							<Badge variant="secondary" class="ml-auto">
								{widgets.filter((widget) => widget.category === item.key).length}
							</Badge>
						</Button>
					{/each}
				</nav>
			</div>
		</aside>

		{#if selectedCategory}
			<section class="flex min-w-0 flex-col gap-4">
				<div class="flex items-end justify-between gap-4">
					<div class="flex flex-col gap-1">
						<h2 class="text-lg font-semibold">{selectedCategory.label}</h2>
						<p class="text-sm text-muted-foreground">{categoryDetails[selectedCategory.key].description}</p>
					</div>
					<p class="shrink-0 text-sm text-muted-foreground">{selectedWidgets.length} {selectedWidgets.length === 1 ? "widget" : "widgets"}</p>
				</div>
				<div class="grid gap-4 xl:grid-cols-2">
					{#each selectedWidgets as widget (widget.key)}
						<Card.Root class={wide.has(widget.key) ? "h-auto xl:col-span-2" : "h-auto"}>
							<Card.Header class="gap-0">
								<Card.Title>{widget.label}</Card.Title>
								<Card.Description>{widget.description}</Card.Description>
								<Card.Action><Badge variant="outline">{widget.key}</Badge></Card.Action>
							</Card.Header>
							<Card.Content class={tall.has(widget.key) ? "min-h-80" : "min-h-24"}>
								<div inert class="h-full">
									<PageWidget block={block(widget.key)} {rows} ready {previewSpec} />
								</div>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>
