<script lang="ts">
	import { goto } from "$app/navigation";
	import { spaceLabel } from "$lib/app/labels.ts";
	import { createApp, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import TemplateLibraryDialog from "$lib/components/template-library-dialog.svelte";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as InputGroup from "@jthum/framework/svelte/ui/input-group";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { sampleApps, templateCategories } from "$lib/runtime/samples.ts";
	import { cn } from "$lib/utils.js";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
	import HeadphonesIcon from "@lucide/svelte/icons/headphones";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import MegaphoneIcon from "@lucide/svelte/icons/megaphone";
	import PackageIcon from "@lucide/svelte/icons/package";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import SearchIcon from "@lucide/svelte/icons/search";
	import ShoppingBagIcon from "@lucide/svelte/icons/shopping-bag";
	import UserRoundIcon from "@lucide/svelte/icons/user-round";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false), preset = "" }: { open?: boolean; preset?: string } = $props();

	const pageSize = 6;
	const categoryDetails = {
		all: { label: "All templates", icon: LayoutGridIcon },
		crm: { label: "CRM", icon: UsersIcon },
		projects: { label: "Projects", icon: BriefcaseIcon },
		sales: { label: "Sales", icon: ShoppingBagIcon },
		marketing: { label: "Marketing", icon: MegaphoneIcon },
		operations: { label: "Operations", icon: Settings2Icon },
		finance: { label: "Finance", icon: WalletIcon },
		people: { label: "People & HR", icon: UserRoundIcon },
		support: { label: "Customer support", icon: HeadphonesIcon },
		inventory: { label: "Inventory", icon: PackageIcon },
		events: { label: "Events", icon: CalendarDaysIcon },
		education: { label: "Education", icon: GraduationCapIcon },
		personal: { label: "Personal", icon: UserRoundIcon },
	};
	const categoryTones = {
		all: "bg-primary/10 text-primary",
		crm: "bg-starter-crm/15 text-starter-crm",
		projects: "bg-starter-projects/15 text-starter-projects",
		sales: "bg-starter-content/15 text-starter-content",
		marketing: "bg-starter-crm/15 text-starter-crm",
		operations: "bg-starter-projects/15 text-starter-projects",
		finance: "bg-starter-finance/15 text-starter-finance",
		people: "bg-starter-content/15 text-starter-content",
		support: "bg-primary/10 text-primary",
		inventory: "bg-starter-projects/15 text-starter-projects",
		events: "bg-starter-finance/15 text-starter-finance",
		education: "bg-starter-crm/15 text-starter-crm",
		personal: "bg-primary/10 text-primary",
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

	const space = $derived(spaceLabel(session.space?.name));
	const chosen = $derived(sampleApps.find((sample) => sample.key === selected));
	const categoryCounts = $derived(Object.fromEntries(templateCategories.map((item) => [item.key, sampleApps.filter((sample) => sample.category === item.key).length])));
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const matches = sampleApps.filter((sample) => {
			if (category !== "all" && sample.category !== category) return false;
			if (!needle) return true;
			return `${sample.label} ${sample.description} ${sample.category}`.toLowerCase().includes(needle);
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
		selected = preset || sampleApps[0]?.key || "";
		query = "";
		category = "all";
		sort = "recommended";
		pageIndex = 0;
	});

	function selectCategory(key: string) {
		category = key;
		pageIndex = 0;
		selected = sampleApps.find((sample) => key === "all" || sample.category === key)?.key ?? "";
	}

	function search(value: string) {
		query = value;
		pageIndex = 0;
		const needle = value.trim().toLowerCase();
		selected = sampleApps.find((sample) => {
			if (category !== "all" && sample.category !== category) return false;
			return !needle || `${sample.label} ${sample.description} ${sample.category}`.toLowerCase().includes(needle);
		})?.key ?? "";
	}

	async function create(templateKey: string) {
		if (pending) return;
		const template = sampleApps.find((sample) => sample.key === templateKey);
		const name = template?.label ?? "Untitled app";
		pending = true;
		try {
			await createApp(name, template?.key ?? null);
			toast.success(`${name} is ready`, { description: "You can rename it in App settings." });
			open = false;
			await goto("/");
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
	title="Starter library"
	description="Choose a starting point for your app in {space}. You can rename and tailor it after creation."
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
					{#each ["all", ...templateCategories.map((item) => item.key)] as key (key)}
						{@const detail = categoryDetails[key as keyof typeof categoryDetails]}
						{@const Icon = detail.icon}
						<Button type="button" variant={category === key ? "soft" : "ghost"} class="h-9 min-w-max justify-start gap-2.5 px-3 sm:w-full" onclick={() => selectCategory(key)}>
							<span class={cn("flex size-6 shrink-0 items-center justify-center rounded-md", categoryTones[key as keyof typeof categoryTones])}><Icon class="size-3.5" /></span>
							<span class="min-w-0 flex-1 truncate text-start">{detail.label}</span>
							<span class="text-xs font-normal tabular-nums text-muted-foreground">{key === "all" ? sampleApps.length : categoryCounts[key] ?? 0}</span>
						</Button>
					{/each}
	{/snippet}
	{#snippet toolbar()}
		<div class="flex items-center gap-2">
						<InputGroup.Root class="min-w-0 flex-1 bg-card">
							<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
							<InputGroup.Input value={query} oninput={(event) => search(event.currentTarget.value)} placeholder="Search templates…" autofocus />
						</InputGroup.Root>
						<AppSelect value={sort} onValueChange={(value) => { sort = value; pageIndex = 0; }} options={sortOptions} class="w-40 bg-card" />
		</div>
	{/snippet}
						<div class="grid gap-3 md:grid-cols-2">
							{#each visible as sample (sample.key)}
								{@const detail = categoryDetails[sample.category]}
								{@const Icon = detail.icon}
								<button type="button" aria-pressed={selected === sample.key} class={cn("relative flex min-h-44 flex-col rounded-2xl border-2 bg-card p-4 text-start shadow-xs transition-colors", selected === sample.key ? "border-primary/25 bg-primary/[0.025]" : "border-border/70")} data-sample={sample.key} onclick={() => (selected = sample.key)}>
									<div class="flex w-full items-start justify-between gap-3">
										<span class={cn("flex size-10 items-center justify-center rounded-xl", categoryTones[sample.category])}><Icon class="size-5" /></span>
										<span class={cn("flex size-5 items-center justify-center rounded-full border", selected === sample.key ? "border-primary bg-primary" : "border-input bg-background")}>{#if selected === sample.key}<span class="size-2 rounded-full bg-primary-foreground"></span>{/if}</span>
									</div>
									<div class="mt-4 flex min-w-0 flex-1 flex-col gap-1">
										<span class="font-semibold">{sample.label}</span>
										<span class="line-clamp-2 text-sm text-muted-foreground">{sample.description}</span>
									</div>
									<div class="mt-3 flex flex-wrap gap-1 border-t pt-3">
										<Badge variant="surface">{detail.label}</Badge>
										<Badge variant="surface">{sample.spec.types.length} types</Badge>
										<Badge variant="surface">{sample.spec.views.length} views</Badge>
									</div>
								</button>
							{/each}
						</div>
						{#if !filtered.length}<p class="py-12 text-center text-sm text-muted-foreground">No templates match your search.</p>{/if}
	{#snippet actions()}
		<Button type="button" variant="outline" disabled={pending} onclick={() => create("")}>Start blank</Button>
		<Button type="submit" disabled={pending || !selected} data-testid="create-app">{#if pending}<Spinner data-icon="inline-start" />{/if}Use template</Button>
	{/snippet}
</TemplateLibraryDialog>
