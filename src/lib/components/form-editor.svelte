<script lang="ts">
	import { goto } from "$app/navigation";
	import {
		reorderAtVerticalTarget,
		startVerticalDrag,
		type VerticalDragSession,
		verticalDropTarget,
	} from "$lib/app/drag.ts";
	import { fieldKindLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import EditorActions from "$lib/components/editor-actions.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import type { FormDef } from "$lib/runtime/model.ts";
	import { cn, stableStringify } from "$lib/utils.ts";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import { onDestroy, untrack } from "svelte";
	import { flip } from "svelte/animate";
	import { toast } from "svelte-sonner";

	let { form }: { form: FormDef } = $props();

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const flows = $derived(spec?.flows ?? []);

	type FormFieldRow = { field: string; on: boolean };

	let initializedForm = $state("");
	let label = $state("");
	let typeKey = $state("");
	let mode = $state<FormDef["mode"]>("create");
	let fieldRows = $state<FormFieldRow[]>([]);
	let submitFlow = $state("");
	let deleteOpen = $state(false);
	let advancedOpen = $state(false);
	let dragField = $state<string | null>(null);
	let fieldList = $state<HTMLDivElement | null>(null);
	let dragSession: VerticalDragSession | null = null;

	$effect(() => {
		const type = types.find((item) => item.key === form.type);
		if (!type) return;
		const identity = `${form.id}:${form.key}`;
		if (initializedForm === identity) return;
		initializedForm = identity;
		untrack(() => {
			label = form.label;
			typeKey = form.type;
			mode = form.mode;
			submitFlow = form.submit?.flow ?? "";
			advancedOpen = Boolean(form.submit?.flow);
			fieldRows = mergeFields([], type.fields.map((field) => field.key), form.fields);
		});
	});

	const sourceType = $derived(
		types.find((item) => item.key === typeKey) ?? types.find((item) => item.key === form.type),
	);
	const selected = $derived(fieldRows.filter((row) => row.on).map((row) => row.field));
	const availableFields = $derived(
		fieldRows.flatMap((row) => {
			const definition = sourceType?.fields.find((field) => field.key === row.field);
			return definition ? [{ ...row, definition }] : [];
		}),
	);

	$effect(() => {
		const choices = sourceType?.fields.map((field) => field.key) ?? [];
		untrack(() => {
			fieldRows = mergeFields(fieldRows, choices);
		});
	});

	const draft = $derived({
		...form,
		label,
		type: typeKey,
		mode,
		fields: selected,
		submit: submitFlow ? { flow: submitFlow } : undefined,
	});
	const dirty = $derived(stableStringify(draft) !== stableStringify(form));

	function mergeFields(current: FormFieldRow[], choices: string[], preferredOn?: string[]): FormFieldRow[] {
		const choiceSet = new Set(choices);
		const enabled = new Set(preferredOn ?? current.filter((row) => row.on).map((row) => row.field));
		if (![...enabled].some((field) => choiceSet.has(field))) {
			for (const field of choices) enabled.add(field);
		}
		const ordered = preferredOn ? [...preferredOn, ...current.map((row) => row.field)] : current.map((row) => row.field);
		return [...new Set([...ordered, ...choices])]
			.filter((field) => choiceSet.has(field))
			.map((field) => ({ field, on: enabled.has(field) }));
	}

	function setFieldOn(field: string, on: boolean) {
		if (!on && selected.length <= 1) return;
		fieldRows = fieldRows.map((row) => row.field === field ? { ...row, on } : row);
	}

	function moveField(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= fieldRows.length) return;
		const next = [...fieldRows];
		[next[index], next[target]] = [next[target]!, next[index]!];
		fieldRows = next;
	}

	function onFieldDragStart(field: string, event: PointerEvent) {
		const handle = event.currentTarget as HTMLElement;
		dragField = field;
		dragSession = startVerticalDrag({
			event,
			container: fieldList,
			item: handle.closest<HTMLElement>("[role=listitem]"),
			onMove: (clientY) => {
				const target = verticalDropTarget(fieldList, clientY);
				if (target) fieldRows = reorderAtVerticalTarget(fieldRows, field, target, (row) => row.field);
			},
			onDrop: () => {
				dragSession = null;
				dragField = null;
			},
			onCancel: () => {
				dragSession = null;
				dragField = null;
			},
		});
		if (!dragSession) dragField = null;
	}

	onDestroy(() => dragSession?.cancel());

	async function save() {
		await runtime().upsertForm(draft);
		toast.success("Form saved");
	}

	async function remove() {
		await runtime().deleteForm(form.key);
		toast.success("Form deleted");
		await goto("/build/forms");
	}
</script>

<div class="flex flex-col gap-8">
	<PageHeader
		title={label || form.label}
		description="Choose what this form is for, arrange its fields, and preview the result as you work."
	/>

	<Card.Root class="h-auto">
		<Card.Header class="gap-0">
			<Card.Title>Form setup</Card.Title>
			<Card.Description>Name the form, choose its records, and decide when it is used.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.Group>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="form-name">Name</Field.Label>
						<Input id="form-name" bind:value={label} placeholder="Add project" />
					</Field.Field>
					<Field.Field>
						<Field.Label>Record type</Field.Label>
						<AppSelect
							bind:value={typeKey}
							options={types.map((type) => ({ value: type.key, label: type.label }))}
						/>
					</Field.Field>
				</div>
				<Field.FieldSet>
					<Field.FieldLegend>What is this form for?</Field.FieldLegend>
					<ToggleGroup.Root
						type="single"
						value={mode}
						onValueChange={(value) => value && (mode = value as FormDef["mode"])}
						variant="card"
						size="card"
						spacing={2}
						class="grid w-full grid-cols-1 md:grid-cols-3"
					>
						<ToggleGroup.Item value="create">
							<span class="mt-0.5 flex size-4 shrink-0 rounded-full border group-data-[state=on]/toggle:border-primary">
								<span class="m-auto size-2 rounded-full bg-primary opacity-0 group-data-[state=on]/toggle:opacity-100"></span>
							</span>
							<span class="flex min-w-0 flex-col gap-0.5">
								<span>Add records</span>
								<span class="text-xs font-normal text-muted-foreground">Shown when someone creates a new record.</span>
							</span>
						</ToggleGroup.Item>
						<ToggleGroup.Item value="edit">
							<span class="mt-0.5 flex size-4 shrink-0 rounded-full border group-data-[state=on]/toggle:border-primary">
								<span class="m-auto size-2 rounded-full bg-primary opacity-0 group-data-[state=on]/toggle:opacity-100"></span>
							</span>
							<span class="flex min-w-0 flex-col gap-0.5">
								<span>Edit records</span>
								<span class="text-xs font-normal text-muted-foreground">Shown when someone changes an existing record.</span>
							</span>
						</ToggleGroup.Item>
						<ToggleGroup.Item value="custom">
							<span class="mt-0.5 flex size-4 shrink-0 rounded-full border group-data-[state=on]/toggle:border-primary">
								<span class="m-auto size-2 rounded-full bg-primary opacity-0 group-data-[state=on]/toggle:opacity-100"></span>
							</span>
							<span class="flex min-w-0 flex-col gap-0.5">
								<span>Custom use</span>
								<span class="text-xs font-normal text-muted-foreground">Opened explicitly from a page or workflow.</span>
							</span>
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				</Field.FieldSet>
			</Field.Group>
		</Card.Content>
	</Card.Root>

	<Card.Root class="h-auto">
		<Card.Header class="gap-0">
			<Card.Title>Fields</Card.Title>
			<Card.Description>Turn fields on or off and drag them into the order people should complete them.</Card.Description>
			<Card.Action><Badge variant="secondary">{selected.length} shown</Badge></Card.Action>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-2" role="list" bind:this={fieldList}>
				{#each availableFields as item, index (item.field)}
					<div
						role="listitem"
						data-sort-key={item.field}
						animate:flip={{ duration: 160 }}
						class={cn(
							"flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10",
							!item.on && "opacity-65",
							dragField === item.field && "pointer-events-none opacity-0",
						)}
					>
						<button
							type="button"
							class="touch-none cursor-grab text-muted-foreground select-none hover:text-foreground active:cursor-grabbing"
							aria-label="Drag to reorder {item.definition.label}"
							onpointerdown={(event) => onFieldDragStart(item.field, event)}
						>
							<GripVerticalIcon class="size-4" />
						</button>
						<Switch
							size="sm"
							checked={item.on}
							disabled={item.on && selected.length <= 1}
							onCheckedChange={(value) => setFieldOn(item.field, Boolean(value))}
							aria-label="Show {item.definition.label}"
						/>
						<div class="min-w-0 flex-1">
							<div class="font-medium">{item.definition.label}</div>
							<div class="text-sm text-muted-foreground">{fieldKindLabel[item.definition.type]}</div>
						</div>
						{#if item.definition.required}<Badge variant="outline">Required</Badge>{/if}
						<div class="flex shrink-0 items-center">
							<Button variant="ghost" size="icon-sm" disabled={index === 0} onclick={() => moveField(index, -1)} aria-label="Move {item.definition.label} up">
								<ChevronUpIcon />
							</Button>
							<Button variant="ghost" size="icon-sm" disabled={index === availableFields.length - 1} onclick={() => moveField(index, 1)} aria-label="Move {item.definition.label} down">
								<ChevronDownIcon />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card.Content>
		<Card.Footer class="justify-between gap-3">
			<span class="text-xs text-muted-foreground">Order here becomes the form’s reading order.</span>
			<Badge variant="outline">{fieldRows.length - selected.length} hidden</Badge>
		</Card.Footer>
	</Card.Root>

	<Separator />
	<Collapsible.Root bind:open={advancedOpen}>
		<Collapsible.Trigger class="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-start text-muted-foreground hover:text-foreground">
			<span class="flex flex-col gap-0">
				<span class="font-medium text-foreground">Advanced</span>
				<span class="text-sm">Optionally run a workflow after the record is saved.</span>
			</span>
			<span class="flex shrink-0 items-center gap-2">
				{#if submitFlow}<Badge variant="secondary">Workflow connected</Badge>{/if}
				<ChevronDownIcon class="size-4 transition-transform {advancedOpen ? 'rotate-180' : ''}" />
			</span>
		</Collapsible.Trigger>
		<Collapsible.Content class="pt-3">
			<Card.Root class="h-auto">
				<Card.Header class="gap-0">
					<Card.Title>After save</Card.Title>
					<Card.Description>Continue with a workflow after this form successfully saves its record.</Card.Description>
				</Card.Header>
				<Card.Content>
					<Field.Field>
						<Field.Label>Next step</Field.Label>
						<AppSelect
							bind:value={submitFlow}
							options={[
								{ value: "", label: "Just save the record" },
								...flows.map((item) => ({ value: item.key, label: item.label })),
							]}
						/>
						<Field.Description>Only workflows available in this app are listed.</Field.Description>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		</Collapsible.Content>
	</Collapsible.Root>

	<Card.Root class="h-auto">
		<Card.Header class="gap-0">
			<Card.Title>Live preview</Card.Title>
			<Card.Description>This is how the selected fields and their order will appear.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if sourceType}
				<div inert>
					<RecordForm type={sourceType} form={draft} fields={selected} fullWidth />
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<EditorActions {dirty} onSave={save}>
		{#snippet left()}
			{#if !form.implicit}
				<Button variant="destructive-outline" size="sm" onclick={() => (deleteOpen = true)}>Delete form</Button>
			{/if}
		{/snippet}
	</EditorActions>
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {form.label}?</AlertDialog.Title>
			<AlertDialog.Description>The custom form is removed. The built-in add/edit screens remain.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
