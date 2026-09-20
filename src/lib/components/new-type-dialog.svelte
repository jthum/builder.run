<script lang="ts">
	import { goto } from "$app/navigation";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { OptionSelect } from "@jthum/framework/svelte/ui/option-select";
	import TemplateLibraryDialog from "$lib/components/template-library-dialog.svelte";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as InputGroup from "@jthum/framework/svelte/ui/input-group";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import { typeDraftFromTemplate, typeTemplateCategories, typeTemplates } from "$lib/runtime/type-templates.ts";
	import { cn } from "$lib/utils.js";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import ListTodoIcon from "@lucide/svelte/icons/list-todo";
	import ReceiptIcon from "@lucide/svelte/icons/receipt";
	import SearchIcon from "@lucide/svelte/icons/search";
	import StickyNoteIcon from "@lucide/svelte/icons/sticky-note";
	import UserIcon from "@lucide/svelte/icons/user";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import { toast } from "svelte-sonner";
	import type { Component } from "svelte";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const pageSize = 6;
	const icons: Record<string, Component> = { person: UserIcon, organisation: Building2Icon, project: BriefcaseIcon, task: ListTodoIcon, invoice: ReceiptIcon, expense: WalletIcon, note: StickyNoteIcon, event: CalendarIcon };
	const categoryDetails = {
		all: { label: "All templates", icon: LayersIcon },
		people: { label: "People", icon: UserIcon },
		work: { label: "Work", icon: BriefcaseIcon },
		money: { label: "Money", icon: WalletIcon },
		content: { label: "Content", icon: StickyNoteIcon },
	};
	const categoryTones = {
		all: "bg-primary/10 text-primary",
		people: "bg-starter-crm/15 text-starter-crm",
		work: "bg-starter-projects/15 text-starter-projects",
		money: "bg-starter-finance/15 text-starter-finance",
		content: "bg-starter-content/15 text-starter-content",
	};
	const sortOptions = [
		{ value: "recommended", label: "Recommended" },
		{ value: "name", label: "Name A–Z" },
	];

	let query = $state("");
	let category = $state("all");
	let sort = $state("recommended");
	let selected = $state("");
	let pageIndex = $state(0);
	let pending = $state(false);

	const visibleTypes = $derived(canonicalStudio.context?.collections ?? []);
	const chosen = $derived(typeTemplates.find((item) => item.key === selected));
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const matches = typeTemplates.filter((sample) => {
			if (category !== "all" && sample.category !== category) return false;
			if (!needle) return true;
			return `${sample.label} ${sample.description} ${sample.category} ${sample.fields.map((field) => field.label ?? field.key).join(" ")}`.toLowerCase().includes(needle);
		});
		return sort === "name" ? [...matches].sort((a, b) => a.label.localeCompare(b.label)) : matches;
	});
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const currentPage = $derived(Math.min(pageIndex, pageCount - 1));
	const visible = $derived(filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize));
	const rangeStart = $derived(filtered.length ? currentPage * pageSize + 1 : 0);
	const rangeEnd = $derived(Math.min((currentPage + 1) * pageSize, filtered.length));

	$effect(() => {
		if (!open) return;
		selected = typeTemplates[0]?.key ?? "";
		query = "";
		category = "all";
		sort = "recommended";
		pageIndex = 0;
	});

	function selectCategory(key: string) {
		category = key;
		pageIndex = 0;
		selected = typeTemplates.find((sample) => key === "all" || sample.category === key)?.key ?? "";
	}

	function search(value: string) {
		query = value;
		pageIndex = 0;
		const needle = value.trim().toLowerCase();
		selected = typeTemplates.find((sample) => {
			if (category !== "all" && sample.category !== category) return false;
			const haystack = `${sample.label} ${sample.description} ${sample.category} ${sample.fields.map((field) => field.label ?? field.key).join(" ")}`.toLowerCase();
			return !needle || haystack.includes(needle);
		})?.key ?? "";
	}

	async function create(templateKey: string) {
		if (pending) return;
		const template = typeTemplates.find((item) => item.key === templateKey);
		const name = template?.label ?? "Untitled type";
		pending = true;
		try {
			const draft = typeDraftFromTemplate(name, template, visibleTypes as never);
			const type = await canonicalStudio.createCollection({
						key: draft.key,
						label: draft.label,
						fields: draft.fields.map((field) => ({
							id: field.id ?? "",
							key: field.key,
							label: field.label ?? labelFromKey(field.key),
							type: field.type,
							required: field.required,
							default: field.default,
							values: field.values,
							target: field.target,
						})),
					});
			toast.success(`${type.label} is ready`);
			open = false;
			await goto(`/build/types/${type.key}`);
		} finally {
			pending = false;
		}
	}

	async function submit(event: Event) {
		event.preventDefault();
		if (selected) await create(selected);
	}
</script>

<TemplateLibraryDialog
	bind:open
	title="Field starter library"
	description="Choose a familiar record shape, then tailor its name and fields."
	total={filtered.length}
	{rangeStart}
	{rangeEnd}
	selectedLabel={chosen?.label}
	canGoBack={currentPage > 0}
	canGoForward={currentPage < pageCount - 1}
	onBack={() => (pageIndex = currentPage - 1)}
	onForward={() => (pageIndex = currentPage + 1)}
	onSubmit={submit}
>
	{#snippet categories()}
					{#each ["all", ...typeTemplateCategories.map((item) => item.key)] as key (key)}
						{@const detail = categoryDetails[key as keyof typeof categoryDetails]}
						{@const Icon = detail.icon}
						<Button type="button" variant={category === key ? "soft" : "ghost"} class="h-10 min-w-max justify-start gap-2.5 px-3 sm:w-full" onclick={() => selectCategory(key)}>
							<span class={cn("flex size-6 shrink-0 items-center justify-center rounded-md", categoryTones[key as keyof typeof categoryTones])}><Icon class="size-3.5" /></span>
							<span>{detail.label}</span>
						</Button>
					{/each}
	{/snippet}
	{#snippet toolbar()}
		<div class="flex items-center gap-2">
						<InputGroup.Root class="min-w-0 flex-1 bg-card">
							<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
							<InputGroup.Input value={query} oninput={(event) => search(event.currentTarget.value)} placeholder="Search templates or fields…" autofocus />
						</InputGroup.Root>
						<OptionSelect value={sort} onValueChange={(value) => { sort = value; pageIndex = 0; }} options={sortOptions} class="w-40 bg-card" />
		</div>
	{/snippet}
						<div class="grid gap-3 md:grid-cols-2">
							{#each visible as sample (sample.key)}
								{@const Icon = icons[sample.key] ?? LayersIcon}
								<button type="button" aria-pressed={selected === sample.key} class={cn("relative flex min-h-48 flex-col rounded-2xl border-2 bg-card p-4 text-start shadow-xs transition-colors", selected === sample.key ? "border-primary/25 bg-primary/[0.025]" : "border-border/70")} data-testid="type-template" data-template={sample.key} onclick={() => (selected = sample.key)}>
									<div class="flex w-full items-start justify-between gap-3">
										<span class={cn("flex size-10 items-center justify-center rounded-xl", categoryTones[sample.category])}><Icon class="size-5" /></span>
										<span class={cn("flex size-5 items-center justify-center rounded-full border", selected === sample.key ? "border-primary bg-primary" : "border-input bg-background")}>{#if selected === sample.key}<span class="size-2 rounded-full bg-primary-foreground"></span>{/if}</span>
									</div>
									<div class="mt-4 flex min-w-0 flex-1 flex-col gap-1">
										<span class="font-semibold">{sample.label}</span>
										<span class="line-clamp-2 text-sm text-muted-foreground">{sample.description}</span>
									</div>
									<div class="mt-3 flex flex-wrap gap-1 border-t pt-3">
										{#each sample.fields.slice(0, 4) as field (field.key)}<Badge variant="surface">{field.label ?? labelFromKey(field.key)}</Badge>{/each}
										{#if sample.fields.length > 4}<Badge variant="outline">+{sample.fields.length - 4}</Badge>{/if}
									</div>
								</button>
							{/each}
						</div>
						{#if !filtered.length}<p class="py-12 text-center text-sm text-muted-foreground">No templates match your search.</p>{/if}
	{#snippet actions()}
		<Button type="button" variant="outline" disabled={pending} onclick={() => create("")}>Start blank</Button>
		<Button type="submit" disabled={pending || !selected} data-testid="create-type">{#if pending}<Spinner data-icon="inline-start" />{/if}Use template</Button>
	{/snippet}
</TemplateLibraryDialog>
