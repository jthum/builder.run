<script lang="ts">
	import { goto } from "$app/navigation";
	import { fieldKindHint, fieldKindLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import StatusPill from "$lib/components/status-pill.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import {
		FIELD_KINDS,
		type FieldDef,
		type FieldKind,
		type TypeDef,
		type ValueSemantic,
	} from "$lib/runtime/model.ts";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import HashIcon from "@lucide/svelte/icons/hash";
	import LinkIcon from "@lucide/svelte/icons/link";
	import ListIcon from "@lucide/svelte/icons/list";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import ToggleLeftIcon from "@lucide/svelte/icons/toggle-left";
	import TypeIcon from "@lucide/svelte/icons/type";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Component } from "svelte";
	import { toast } from "svelte-sonner";

	let { type }: { type: TypeDef } = $props();

	const kindIcons: Record<FieldKind, Component> = {
		text: TypeIcon,
		number: HashIcon,
		date: CalendarIcon,
		boolean: ToggleLeftIcon,
		enum: ListIcon,
		reference: LinkIcon,
	};
	const numberPresentationOptions = [
		{ value: "", label: "Standard number" },
		{ value: "rating", label: "Rating" },
	];
	const enumPresentationOptions = [
		{ value: "", label: "Standard text" },
		{ value: "badge", label: "Badge" },
	];
	const semanticOptions: Array<{ value: ValueSemantic; label: string }> = [
		{ value: "neutral", label: "Normal" },
		{ value: "info", label: "Info" },
		{ value: "success", label: "Success" },
		{ value: "warning", label: "Warning" },
		{ value: "danger", label: "Danger" },
	];

	const spec = $derived(session.snapshot?.spec);
	const targets = $derived(spec?.types ?? []);
	const targetOptions = $derived(
		targets
			.filter((item) => item.key !== type.key)
			.map((item) => ({
				value: item.key,
				label: item.expose ? `${item.label} (this space)` : item.label,
			})),
	);
	const inbound = $derived(
		(spec?.types ?? []).flatMap((item) =>
			item.fields
				.filter((field) => field.type === "reference" && field.target?.split(".").at(-1) === type.key)
				.map((field) => ({ type: item, field })),
		),
	);

	let sheetOpen = $state(false);
	let editing = $state<FieldDef | null>(null);
	let fieldKey = $state("");
	let fieldLabel = $state("");
	let fieldType = $state<string>("text");
	let fieldRequired = $state(false);
	let fieldChoices = $state<string[]>([]);
	let fieldValueSemantics = $state<Record<string, ValueSemantic>>({});
	let choiceDraft = $state("");
	let fieldTarget = $state("");
	let fieldPresentation = $state<"" | "rating" | "badge">("");
	let fieldRatingVariant = $state<"segments">("segments");
	let fieldRatingMax = $state("10");
	let advanced = $state(false);
	let removeKey = $state<string | null>(null);
	let deleteOpen = $state(false);
	let dragKey = $state<string | null>(null);

	const selectedKind = $derived((FIELD_KINDS.includes(fieldType as FieldKind) ? fieldType : "text") as FieldKind);

	function openAdd(kind: FieldKind = "text") {
		editing = null;
		fieldKey = "";
		fieldLabel = "";
		fieldType = kind;
		fieldRequired = false;
		fieldChoices = kind === "enum" ? ["draft", "active"] : [];
		fieldValueSemantics = {};
		choiceDraft = "";
		fieldTarget = targetOptions[0]?.value ?? "";
		fieldPresentation = "";
		fieldRatingVariant = "segments";
		fieldRatingMax = "10";
		advanced = false;
		sheetOpen = true;
	}

	function openEdit(field: FieldDef) {
		editing = field;
		fieldKey = field.key;
		fieldLabel = field.label;
		fieldType = field.type;
		fieldRequired = Boolean(field.required);
		fieldChoices = [...(field.values ?? [])];
		fieldValueSemantics = field.value_semantics ? { ...field.value_semantics } : {};
		choiceDraft = "";
		fieldTarget = field.target ?? "";
		fieldPresentation = field.presentation ?? "";
		fieldRatingVariant = field.variant ?? "segments";
		fieldRatingMax = String(field.max ?? 10);
		advanced = false;
		sheetOpen = true;
	}

	function addChoice() {
		const value = slugify(choiceDraft);
		if (!value || fieldChoices.includes(value)) {
			choiceDraft = "";
			return;
		}
		fieldChoices = [...fieldChoices, value];
		fieldValueSemantics = { ...fieldValueSemantics, [value]: "neutral" };
		choiceDraft = "";
	}

	function removeChoice(value: string) {
		fieldChoices = fieldChoices.filter((item) => item !== value);
		const next = { ...fieldValueSemantics };
		delete next[value];
		fieldValueSemantics = next;
	}

	function setChoiceSemantic(value: string, semantic: string) {
		fieldValueSemantics = { ...fieldValueSemantics, [value]: semantic as ValueSemantic };
	}

	function setFieldType(kind: FieldKind) {
		if (fieldType !== kind) fieldPresentation = "";
		fieldType = kind;
	}

	async function saveField() {
		const key = fieldKey.trim() || slugify(fieldLabel);
		if (!key) return;
		if (fieldType === "reference" && !fieldTarget) {
			toast.error("Pick a record type to link to");
			return;
		}
		if (fieldType === "enum" && fieldChoices.length === 0) {
			toast.error("Add at least one choice");
			return;
		}
		if (editing && editing.key !== key) {
			await runtime().renameField(type.key, editing.key, key);
		}
		await runtime().upsertField(type.key, {
			key,
			label: fieldLabel || undefined,
			type: fieldType as FieldKind,
			required: fieldRequired,
			values: fieldType === "enum" ? fieldChoices : undefined,
			target: fieldType === "reference" ? fieldTarget : undefined,
			presentation:
				fieldType === "number" && fieldPresentation === "rating"
					? "rating"
					: fieldType === "enum" && fieldPresentation === "badge"
						? "badge"
						: undefined,
			variant: fieldType === "number" && fieldPresentation === "rating" ? fieldRatingVariant : undefined,
			max:
				fieldType === "number" && fieldPresentation === "rating"
					? Math.min(10, Math.max(2, Math.round(Number(fieldRatingMax) || 10)))
					: undefined,
			value_semantics:
				fieldType === "enum" && fieldPresentation === "badge"
					? Object.fromEntries(
							fieldChoices.map((value) => [value, fieldValueSemantics[value] ?? "neutral"]),
						)
					: undefined,
		});
		sheetOpen = false;
		toast.success(editing ? "Field saved" : "Field added");
	}

	async function move(index: number, delta: number) {
		const next = type.fields.map((field) => field.key);
		const target = index + delta;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		await runtime().reorderFields(type.key, next);
	}

	function onDragStart(key: string, event: DragEvent) {
		dragKey = key;
		event.dataTransfer?.setData("text/plain", key);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
	}

	async function onDrop(key: string) {
		if (!dragKey || dragKey === key) {
			dragKey = null;
			return;
		}
		const keys = type.fields.map((field) => field.key);
		const from = keys.indexOf(dragKey);
		const to = keys.indexOf(key);
		if (from < 0 || to < 0) {
			dragKey = null;
			return;
		}
		keys.splice(from, 1);
		keys.splice(to, 0, dragKey);
		dragKey = null;
		await runtime().reorderFields(type.key, keys);
	}

	async function remove() {
		if (!removeKey) return;
		await runtime().deleteField(type.key, removeKey);
		removeKey = null;
		toast.success("Field removed");
	}

	async function removeType() {
		await runtime().deleteType(type.key);
		toast.success("Type removed");
		await goto("/build/types");
	}

	const removing = $derived(type.fields.find((field) => field.key === removeKey));
	const canSave = $derived(
		Boolean(fieldLabel.trim()) &&
			(fieldType !== "reference" || Boolean(fieldTarget)) &&
			(fieldType !== "enum" || fieldChoices.length > 0),
	);
</script>

<div class="flex flex-col gap-8">
	<PageHeader
		title={type.label}
		description={type.expose
			? "Exposed to apps in this space. Fields here show up in every app you create."
			: "The shape of this record. Lists, forms, and home update as you add fields."}
	>
		{#snippet actions()}
			<Button onclick={() => openAdd()}>
				<PlusIcon data-icon="inline-start" />
				Add field
			</Button>
			{#if !type.expose}
				<Button variant="ghost" onclick={() => (deleteOpen = true)}>Delete</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if inbound.length}
		<p class="text-sm text-muted-foreground">
			Linked from
			{inbound.map((item) => `${item.type.label} (${item.field.label})`).join(", ")}.
		</p>
	{/if}

	{#if type.fields.length === 0}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4 p-5">
				<div class="flex flex-col gap-1">
					<p class="font-medium">What does a {type.label.toLowerCase()} remember?</p>
					<p class="text-sm text-muted-foreground">
						Pick a field kind to start. You can reorder and edit anything after.
					</p>
				</div>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each FIELD_KINDS as kind (kind)}
						{@const Icon = kindIcons[kind]}
						<button
							type="button"
							class="flex items-start gap-3 rounded-xl border bg-background p-3 text-start transition-colors hover:bg-muted/40"
							onclick={() => openAdd(kind)}
						>
							<span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
								<Icon class="size-4" />
							</span>
							<span class="min-w-0">
								<span class="block text-sm font-medium">{fieldKindLabel[kind]}</span>
								<span class="block text-xs text-muted-foreground">{fieldKindHint[kind]}</span>
							</span>
						</button>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="flex flex-col gap-2" role="list">
			{#each type.fields as field, index (field.id)}
				{@const Icon = kindIcons[field.type] ?? TypeIcon}
				<div
					role="listitem"
					class="flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10 {dragKey ===
					field.key
						? 'opacity-60'
						: ''}"
					ondragover={(event) => event.preventDefault()}
					ondrop={() => onDrop(field.key)}
				>
					<button
						type="button"
						class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
						draggable="true"
						aria-label="Drag to reorder"
						ondragstart={(event) => onDragStart(field.key, event)}
						ondragend={() => (dragKey = null)}
					>
						<GripVerticalIcon class="size-4" />
					</button>
					<button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-start" onclick={() => openEdit(field)}>
						<div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
							<Icon class="size-4" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="font-medium">{field.label}</div>
							<div class="text-sm text-muted-foreground">
								{fieldKindLabel[field.type]}
								{#if field.target}
									{@const target = targets.find((item) => item.key === field.target?.split(".").at(-1))}
									→ {target?.label ?? field.target}
								{/if}
								{#if field.type === "enum" && field.values?.length}
									· {field.values.map((value) => value.replaceAll("_", " ")).join(", ")}
								{/if}
								{#if field.type === "enum" && field.presentation === "badge"}
									· Badges
								{/if}
								{#if field.type === "number" && field.presentation === "rating"}
									· Rating · {field.max ?? 10} points
								{/if}
							</div>
						</div>
					</button>
					<div class="flex shrink-0 items-center gap-1">
						{#if field.required}
							<Badge variant="secondary">Required</Badge>
						{/if}
						<Button size="icon-sm" variant="ghost" disabled={index === 0} onclick={() => move(index, -1)}>
							<ChevronUpIcon />
							<span class="sr-only">Move up</span>
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							disabled={index === type.fields.length - 1}
							onclick={() => move(index, 1)}
						>
							<ChevronDownIcon />
							<span class="sr-only">Move down</span>
						</Button>
					</div>
				</div>
			{/each}
			<Button variant="outline" onclick={() => openAdd()}>
				<PlusIcon data-icon="inline-start" />
				Add field
			</Button>
		</div>
	{/if}
</div>

<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content class="sm:max-w-md" side="right">
		<Sheet.Header>
			<Sheet.Title>{editing ? "Edit field" : "Add field"}</Sheet.Title>
			<Sheet.Description>
				{editing ? "Change how this field is stored and shown." : "People see the name. The kind decides the control."}
			</Sheet.Description>
		</Sheet.Header>
		<div class="flex flex-col gap-4 overflow-y-auto px-6">
			<Field.Group>
				<Field.Field>
					<Field.Label>Name</Field.Label>
					<Input bind:value={fieldLabel} placeholder="Name" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Kind</Field.Label>
					<div class="grid grid-cols-2 gap-2">
						{#each FIELD_KINDS as kind (kind)}
							{@const Icon = kindIcons[kind]}
							<button
								type="button"
								class="flex items-start gap-2 rounded-xl border p-2.5 text-start transition-colors hover:bg-muted/40 {selectedKind ===
								kind
									? 'border-primary bg-primary/5 ring-2 ring-primary/20'
									: 'border-border'}"
								onclick={() => setFieldType(kind)}
							>
								<Icon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<span class="min-w-0">
									<span class="block text-sm font-medium">{fieldKindLabel[kind]}</span>
									<span class="block text-xs text-muted-foreground">{fieldKindHint[kind]}</span>
								</span>
							</button>
						{/each}
					</div>
				</Field.Field>
				{#if fieldType === "enum"}
					<Field.Field>
						<Field.Label>Choices</Field.Label>
						<div class="flex flex-wrap gap-1.5">
							{#each fieldChoices as value (value)}
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium"
									onclick={() => removeChoice(value)}
								>
									{value.replaceAll("_", " ")}
									<XIcon class="size-3 text-muted-foreground" />
								</button>
							{/each}
						</div>
						<div class="flex flex-nowrap gap-2">
							<Input
								bind:value={choiceDraft}
								placeholder="Add a choice"
								onkeydown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addChoice();
									}
								}}
							/>
							<Button type="button" variant="outline" class="shrink-0" onclick={addChoice}>Add</Button>
						</div>
						<Field.Description>People pick one. Click a choice to remove it.</Field.Description>
					</Field.Field>
					<Field.Field>
						<Field.Label>Presentation</Field.Label>
						<AppSelect bind:value={fieldPresentation} options={enumPresentationOptions} />
						<Field.Description>Show choices as plain text or compact badges.</Field.Description>
					</Field.Field>
					{#if fieldPresentation === "badge"}
						<Field.Field>
							<Field.Label>Badge meaning</Field.Label>
							<div class="flex flex-col gap-2">
								{#each fieldChoices as value (value)}
									<div class="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 rounded-xl border bg-background p-2">
										<div class="min-w-0">
											<StatusPill
												path={fieldKey || slugify(fieldLabel) || "choice"}
												{value}
												tone={fieldValueSemantics[value] ?? "neutral"}
											/>
										</div>
										<AppSelect
											value={fieldValueSemantics[value] ?? "neutral"}
											options={semanticOptions}
											onValueChange={(semantic) => setChoiceSemantic(value, semantic)}
										/>
									</div>
								{/each}
							</div>
							<Field.Description>
								Use meaning consistently. Leave ordinary workflow stages as normal or informational.
							</Field.Description>
						</Field.Field>
					{/if}
				{/if}
				{#if fieldType === "reference"}
					<Field.Field>
						<Field.Label>Links to</Field.Label>
						<AppSelect bind:value={fieldTarget} options={targetOptions} placeholder="Select a record type" />
						<Field.Description>
							{#if targetOptions.length}
								The other record type this field points at.
							{:else}
								Add another record type first, then you can link to it.
							{/if}
						</Field.Description>
					</Field.Field>
				{/if}
				{#if fieldType === "number"}
					<Field.Field>
						<Field.Label>Presentation</Field.Label>
						<AppSelect bind:value={fieldPresentation} options={numberPresentationOptions} />
						<Field.Description>Choose how people enter and see this number.</Field.Description>
					</Field.Field>
					{#if fieldPresentation === "rating"}
						<Field.Field>
							<Field.Label>Style</Field.Label>
							<AppSelect
								bind:value={fieldRatingVariant}
								options={[{ value: "segments", label: "Numbered segments" }]}
							/>
							<Field.Description>More rating styles, such as stars, can be added here later.</Field.Description>
						</Field.Field>
						<Field.Field>
							<Field.Label for="rating-maximum">Highest rating</Field.Label>
							<Input
								id="rating-maximum"
								type="number"
								min="2"
								max="10"
								step="1"
								bind:value={fieldRatingMax}
							/>
							<Field.Description>Use a scale from 2 to 10. New ratings start at 1.</Field.Description>
						</Field.Field>
					{/if}
				{/if}
				<Field.Field orientation="horizontal">
					<Switch bind:checked={fieldRequired} id="required" />
					<Field.Label for="required">Required</Field.Label>
				</Field.Field>
			</Field.Group>
			<Separator />
			<Collapsible.Root bind:open={advanced}>
				<Collapsible.Trigger
					class="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
				>
					Advanced
					<ChevronDownIcon class="size-4 transition-transform {advanced ? 'rotate-180' : ''}" />
				</Collapsible.Trigger>
				<Collapsible.Content class="pt-3">
					<Field.Field>
						<Field.Label>Key</Field.Label>
						<Input bind:value={fieldKey} placeholder={slugify(fieldLabel) || "due_date"} />
						<Field.Description>Used in the spec. Leave blank to generate from the name.</Field.Description>
					</Field.Field>
				</Collapsible.Content>
			</Collapsible.Root>
		</div>
		<Sheet.Footer class="flex-row justify-end">
			{#if editing}
				<Button
					variant="ghost"
					onclick={() => {
						removeKey = editing?.key ?? null;
						sheetOpen = false;
					}}
				>
					Remove
				</Button>
			{/if}
			<Button onclick={saveField} disabled={!canSave}>{editing ? "Save field" : "Add field"}</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>

<AlertDialog.Root open={Boolean(removeKey)} onOpenChange={(open) => !open && (removeKey = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove {removing?.label ?? "this field"}?</AlertDialog.Title>
			<AlertDialog.Description>
				Stored values in this column will be dropped. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>Remove</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {type.label}?</AlertDialog.Title>
			<AlertDialog.Description>
				The type, its lists, and its forms go. Records stored as {type.label.toLowerCase()} are dropped.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={removeType}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
