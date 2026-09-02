<script lang="ts">
	import { goto } from "$app/navigation";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import {
		typeDraftFromTemplate,
		typeTemplateCategories,
		typeTemplates,
		type TypeTemplate,
	} from "$lib/runtime/type-templates.ts";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import CheckIcon from "@lucide/svelte/icons/check";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import ReceiptIcon from "@lucide/svelte/icons/receipt";
	import SearchIcon from "@lucide/svelte/icons/search";
	import StickyNoteIcon from "@lucide/svelte/icons/sticky-note";
	import UserIcon from "@lucide/svelte/icons/user";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import ListTodoIcon from "@lucide/svelte/icons/list-todo";
	import { toast } from "svelte-sonner";
	import type { Component } from "svelte";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const icons: Record<string, Component> = {
		person: UserIcon,
		organisation: Building2Icon,
		project: BriefcaseIcon,
		task: ListTodoIcon,
		invoice: ReceiptIcon,
		expense: WalletIcon,
		note: StickyNoteIcon,
		event: CalendarIcon,
	};

	let name = $state("");
	let query = $state("");
	let category = $state("all");
	let selected = $state("");
	let pending = $state(false);

	const types = $derived(session.snapshot?.spec.types ?? []);
	const chosen = $derived(typeTemplates.find((item) => item.key === selected));

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return typeTemplates.filter((sample) => {
			if (category !== "all" && sample.category !== category) return false;
			if (!needle) return true;
			return `${sample.label} ${sample.description} ${sample.category}`.toLowerCase().includes(needle);
		});
	});

	$effect(() => {
		if (!open) return;
		selected = "";
		query = "";
		category = "all";
		name = "";
	});

	function choose(template: TypeTemplate | "") {
		if (template === "") {
			selected = "";
			if (typeTemplates.some((item) => item.label === name)) name = "";
			return;
		}
		selected = template.key;
		if (!name.trim() || typeTemplates.some((item) => item.label === name)) {
			name = template.label;
		}
	}

	async function submit(event: Event) {
		event.preventDefault();
		if (!name.trim()) return;
		pending = true;
		try {
			const draft = typeDraftFromTemplate(name.trim(), chosen, types);
			const type = await runtime().upsertType(draft as never);
			toast.success(`${type.label} is ready`);
			open = false;
			await goto(`/build/types/${type.key}`);
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[min(44rem,calc(100vh-2rem))] overflow-hidden sm:max-w-3xl">
		<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>New record type</Dialog.Title>
				<Dialog.Description>
					A kind of thing this app keeps. Start blank, or pick a template and change the fields.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
				<Field.Field>
					<Field.Label>Name</Field.Label>
					<Input bind:value={name} placeholder="Ticket" autofocus />
				</Field.Field>
				<div class="flex min-h-0 flex-1 flex-col gap-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p class="text-sm font-medium">Start from</p>
						<InputGroup.Root class="sm:max-w-64">
							<InputGroup.Addon>
								<SearchIcon />
							</InputGroup.Addon>
							<InputGroup.Input bind:value={query} placeholder="Filter templates" />
						</InputGroup.Root>
					</div>
					<ToggleGroup.Root type="single" bind:value={category} variant="outline" size="sm">
						<ToggleGroup.Item value="all">All</ToggleGroup.Item>
						{#each typeTemplateCategories as item (item.key)}
							<ToggleGroup.Item value={item.key}>{item.label}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<div class="min-h-0 flex-1 overflow-y-auto pr-1">
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								class="flex flex-col gap-2 rounded-2xl border p-4 text-start transition-colors hover:bg-muted/40 {selected ===
								''
									? 'border-primary ring-2 ring-primary/20'
									: 'border-border'}"
								onclick={() => choose("")}
							>
								<div class="flex items-start justify-between gap-2">
									<div class="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
										<LayersIcon />
									</div>
									{#if selected === ""}
										<CheckIcon class="size-4 text-primary" />
									{/if}
								</div>
								<div class="font-medium">Blank type</div>
								<p class="text-sm text-muted-foreground">
									Start from scratch. Add a name, a status, a date — whatever this record needs.
								</p>
							</button>
							{#each filtered as sample (sample.key)}
								{@const Icon = icons[sample.key] ?? LayersIcon}
								<button
									type="button"
									class="flex flex-col gap-2 rounded-2xl border p-4 text-start transition-colors hover:bg-muted/40 {selected ===
									sample.key
										? 'border-primary ring-2 ring-primary/20'
										: 'border-border'}"
									data-testid="type-template"
									data-template={sample.key}
									onclick={() => choose(sample)}
								>
									<div class="flex items-start justify-between gap-2">
										<div class="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
											<Icon />
										</div>
										{#if selected === sample.key}
											<CheckIcon class="size-4 text-primary" />
										{/if}
									</div>
									<div class="font-medium">{sample.label}</div>
									<p class="text-sm text-muted-foreground">{sample.description}</p>
									<p class="text-xs text-muted-foreground">
										{sample.fields.map((field) => field.label ?? labelFromKey(field.key)).join(" · ")}
									</p>
								</button>
							{/each}
						</div>
						{#if !filtered.length}
							<p class="py-8 text-center text-sm text-muted-foreground">No templates match that filter.</p>
						{/if}
					</div>
				</div>
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !name.trim()} data-testid="create-type">
					{#if pending}<Spinner data-icon="inline-start" />{/if}
					Create type
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
