<script lang="ts">
	import { goto } from "$app/navigation";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import FormPurposePicker from "$lib/components/form-purpose-picker.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import type { FormDef } from "$lib/runtime/model.ts";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const forms = $derived(spec?.forms ?? []);
	const custom = $derived(forms.filter((form) => !form.implicit));
	const builtin = $derived(forms.filter((form) => form.implicit));

	let open = $state(false);
	let name = $state("");
	let mode = $state<FormDef["mode"]>("standalone");
	let typeKey = $state("");
	let pending = $state(false);

	function openCreate() {
		name = "";
		mode = "standalone";
		typeKey = types[0]?.key ?? "";
		open = true;
	}

	async function create(event: Event) {
		event.preventDefault();
		const label = name.trim();
		if (!label || (mode !== "standalone" && !typeKey)) return;
		pending = true;
		try {
			const key = slugify(label);
			const type = types.find((item) => item.key === typeKey);
			await runtime().upsertForm({
				key,
				label,
				mode,
				...(mode === "standalone"
					? { inputs: [{ key: "name", label: "Name", type: "text" as const }] }
					: { type: typeKey, fields: type?.fields.map((field) => field.key) ?? [] }),
			});
			open = false;
			await goto(`/build/forms/${key}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not create form");
		} finally {
			pending = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Forms"
		description="Collect information or create focused screens for adding and editing records."
	>
		{#snippet actions()}
			<Button onclick={openCreate}>
				<PlusIcon data-icon="inline-start" />
				Add form
			</Button>
		{/snippet}
	</PageHeader>

	{#if !forms.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><FormInputIcon /></Empty.Media>
				<Empty.Title>No forms yet</Empty.Title>
				<Empty.Description>Add a record type and default add/edit forms appear here.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#if custom.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Custom</h2>
				{#each custom as form (form.id)}
					<a href="/build/forms/{form.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title>{form.label}</Card.Title>
								<Card.Description>
									{form.mode === "standalone"
										? `${form.inputs?.length ?? 0} ${(form.inputs?.length ?? 0) === 1 ? "input" : "inputs"}`
										: `${form.mode === "create" ? "Add" : "Edit"} ${types.find((type) => type.key === form.type)?.label ?? form.type}`}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			<h2 class="text-sm font-medium text-muted-foreground">Built-in</h2>
			{#each builtin as form (form.id)}
				<a href="/build/forms/{form.key}">
					<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
						<Card.Header>
							<Card.Title class="flex items-center gap-2">
								{form.label}
								<Badge variant="secondary">Default</Badge>
							</Card.Title>
							<Card.Description>
								{form.mode === "create" ? "Add" : "Edit"}
								{types.find((type) => type.key === form.type)?.label ?? form.type}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<form onsubmit={create}>
			<Dialog.Header>
				<Dialog.Title>New form</Dialog.Title>
				<Dialog.Description>Choose a purpose, then configure the form in the editor.</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body>
				<Field.Group>
					<FormPurposePicker bind:value={mode} disableRecordForms={!types.length} />
					{#if mode !== "standalone"}
						<Field.Field>
							<Field.Label>Record type</Field.Label>
							<AppSelect
								bind:value={typeKey}
								options={types.map((type) => ({ value: type.key, label: type.label }))}
							/>
						</Field.Field>
					{/if}
					<Field.Field>
						<Field.Label for="new-form-name">Form name</Field.Label>
						<Input id="new-form-name" bind:value={name} placeholder="Contact us" />
					</Field.Field>
				</Field.Group>
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !name.trim() || (mode !== "standalone" && !typeKey)}>
					Create form
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
