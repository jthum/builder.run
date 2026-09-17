<script lang="ts">
	import { goto } from "$app/navigation";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { OptionSelect } from "@jthum/framework/svelte/studio";
	import { FormPurposePicker } from "@jthum/framework/svelte/studio";
	import { PageHeader } from "@jthum/framework/svelte/studio";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Dialog from "@jthum/framework/svelte/ui/dialog";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";
	import { slugify } from "$lib/runtime/ids.ts";
	import type { FormDraft } from "@jthum/framework/svelte/studio";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	const types = $derived(canonicalStudio.context?.collections ?? []);
	const recordTypes = $derived(types.filter((type) => !type.expose));
	const forms = $derived(canonicalStudio.context?.forms ?? []);
	const custom = $derived(forms.filter((form) => !form.implicit));
	const builtin = $derived(forms.filter((form) => form.implicit));

	let open = $state(false);
	let name = $state("");
	let mode = $state<FormDraft["mode"]>("standalone");
	let typeKey = $state("");
	let pending = $state(false);

	function openCreate() {
		name = "";
		mode = "standalone";
		typeKey = recordTypes[0]?.key ?? "";
		open = true;
	}

	async function create(event: Event) {
		event.preventDefault();
		const label = name.trim();
		if (!label || (mode !== "standalone" && !typeKey)) return;
		pending = true;
		try {
			const key = slugify(label);
			const type = recordTypes.find((item) => item.key === typeKey);
			const actions = canonicalStudio.formActions();
			await actions.save({
				id: "",
				key,
				label,
				mode,
				...(mode === "standalone"
					? { inputs: [actions.prepareField("name", { label: "Name", type: "text" })] }
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
				<FormPurposePicker bind:value={mode} disableRecordForms={!recordTypes.length} />
					{#if mode !== "standalone"}
						<Field.Field>
							<Field.Label>Record type</Field.Label>
							<OptionSelect
								bind:value={typeKey}
								options={recordTypes.map((type) => ({ value: type.key, label: type.label }))}
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
