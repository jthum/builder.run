<script lang="ts">
	import { goto } from "$app/navigation";
	import { spaceLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { sampleApps, templateCategories } from "$lib/runtime/samples.ts";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import CheckIcon from "@lucide/svelte/icons/check";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import SearchIcon from "@lucide/svelte/icons/search";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import { toast } from "svelte-sonner";
	import type { Component } from "svelte";

	let {
		open = $bindable(false),
		preset = "",
	}: {
		open?: boolean;
		preset?: string;
	} = $props();

	const icons: Record<string, Component> = {
		freelance_crm: UsersIcon,
		project_tracker: BriefcaseIcon,
		expense_approval: WalletIcon,
	};

	let name = $state("");
	let query = $state("");
	let category = $state("all");
	let selected = $state("");
	let pending = $state(false);

	const space = $derived(spaceLabel(session.snapshot?.space.name));

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return sampleApps.filter((sample) => {
			if (category !== "all" && sample.category !== category) return false;
			if (!needle) return true;
			return `${sample.label} ${sample.description} ${sample.category}`.toLowerCase().includes(needle);
		});
	});

	$effect(() => {
		if (!open) return;
		selected = preset;
		query = "";
		category = "all";
		const sample = sampleApps.find((item) => item.key === preset);
		name = sample?.label ?? "";
	});

	function choose(key: string) {
		selected = key;
		if (!name.trim() || sampleApps.some((sample) => sample.label === name)) {
			name = sampleApps.find((sample) => sample.key === key)?.label ?? name;
		}
	}

	async function submit(event: Event) {
		event.preventDefault();
		if (!name.trim()) return;
		pending = true;
		try {
			await runtime().createApp(name.trim(), selected || null);
			toast.success(`${name.trim()} is ready`);
			open = false;
			await goto("/");
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[min(44rem,calc(100vh-2rem))] overflow-hidden sm:max-w-3xl">
		<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>New app</Dialog.Title>
				<Dialog.Description>
					Create an app in {space}. Types this space exposes stay available.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
			<Field.Field>
				<Field.Label>Name</Field.Label>
				<Input bind:value={name} placeholder="Freelance CRM" autofocus />
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
				<div class="flex flex-wrap gap-1">
					<Button size="xs" variant={category === "all" ? "default" : "outline"} onclick={() => (category = "all")}>
						All
					</Button>
					{#each templateCategories as item (item.key)}
						<Button
							size="xs"
							variant={category === item.key ? "default" : "outline"}
							onclick={() => (category = item.key)}
						>
							{item.label}
						</Button>
					{/each}
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto pr-1">
					<div class="grid gap-3 sm:grid-cols-2">
						<button
							type="button"
							class="flex flex-col gap-2 rounded-2xl border p-4 text-start transition-colors hover:bg-muted/40 {selected === ''
								? 'border-primary ring-2 ring-primary/20'
								: 'border-border'}"
							onclick={() => {
								selected = "";
								if (sampleApps.some((sample) => sample.label === name)) name = "";
							}}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
									<LayersIcon />
								</div>
								{#if selected === ""}
									<CheckIcon class="size-4 text-primary" />
								{/if}
							</div>
							<div class="font-medium">Blank app</div>
							<p class="text-sm text-muted-foreground">Start from scratch. Add your own record types, views, and rules.</p>
						</button>
						{#each filtered as sample (sample.key)}
							{@const Icon = icons[sample.key] ?? LayersIcon}
							<button
								type="button"
								class="flex flex-col gap-2 rounded-2xl border p-4 text-start transition-colors hover:bg-muted/40 {selected ===
								sample.key
									? 'border-primary ring-2 ring-primary/20'
									: 'border-border'}"
								data-sample={sample.key}
								onclick={() => choose(sample.key)}
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
				<Button type="submit" disabled={pending || !name.trim()} data-testid="create-app">
					{#if pending}<Spinner data-icon="inline-start" />{/if}
					Create app
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
