<script lang="ts">
	import { addLabel, recordTitle } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import ReferencePicker from "$lib/components/reference-picker.svelte";
	import RatingInput from "$lib/components/rating-input.svelte";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { FieldDef, FormDef, RecordValue, TypeDef } from "$lib/runtime/model.ts";
	import { fieldWidget, findType } from "$lib/runtime/query.ts";
	import { cn } from "$lib/utils.ts";

	let {
		type,
		record = null,
		fields,
		form = null,
		defaults = {},
		omit = [],
		onSaved,
		onCancel,
		submitLabel,
		fullWidth = false,
	}: {
		type: TypeDef;
		record?: RecordValue | null;
		fields?: string[];
		form?: FormDef | null;
		defaults?: Record<string, unknown>;
		omit?: string[];
		onSaved?: (record: RecordValue | null) => void;
		onCancel?: () => void;
		submitLabel?: string;
		fullWidth?: boolean;
	} = $props();

	const keys = $derived(
		(fields?.length ? fields : type.fields.map((field) => field.key)).filter(
			(key) => !omit.includes(key),
		),
	);
	const visible = $derived(
		keys
			.filter((key) => key !== type.lifecycle?.field)
			.map((key) => type.fields.find((field) => field.key === key))
			.filter(Boolean) as FieldDef[],
	);
	const optionKeys = $derived(
		visible
			.filter((field) => field.type === "reference" || field.type === "enum")
			.map((field) => field.key)
			.join(","),
	);

	function formValues(
		current: TypeDef,
		row: RecordValue | null | undefined,
		initial: Record<string, unknown>,
	): Record<string, unknown> {
		const next: Record<string, unknown> = {};
		for (const field of current.fields) {
			if (field.key === current.lifecycle?.field) continue;
			const raw = row?.[field.key] ?? initial[field.key] ?? field.default;
			if (field.type === "boolean") next[field.key] = Boolean(raw);
			else next[field.key] = raw ?? "";
		}
		return next;
	}

	let values = $state<Record<string, unknown>>({});
	let error = $state<string | null>(null);
	let pending = $state(false);
	const defaultsKey = $derived(JSON.stringify(defaults));
	const recordId = $derived(record?.id ?? "");

	$effect.pre(() => {
		void recordId;
		const initial = JSON.parse(defaultsKey) as Record<string, unknown>;
		values = formValues(type, record, initial);
	});

	async function optionsFor(field: FieldDef) {
		if (field.type === "enum") {
			return (field.values ?? []).map((value) => ({ id: value, label: labelFromKey(value) }));
		}
		if (field.type !== "reference" || !field.target || !session.host) return [];
		const ctx = runtime().queryContext();
		const target = findType(ctx, field.target);
		if (!target) return [];
		const rows = await runtime().listRecords(target.key);
		return rows.map((row) => ({
			id: row.id,
			label: recordTitle(row, target),
		}));
	}

	let refOptions = $state<Record<string, Array<{ id: string; label: string }>>>({});

	$effect(() => {
		void session.revision;
		void optionKeys;
		const current = visible;
		void (async () => {
			const next: Record<string, Array<{ id: string; label: string }>> = {};
			for (const field of current) {
				if (field.type !== "reference" && field.type !== "enum") continue;
				try {
					next[field.key] = await optionsFor(field);
				} catch (err) {
					console.warn(`Couldn't load ${field.key} options`, err);
					next[field.key] = [];
				}
			}
			refOptions = next;
		})();
	});

	async function submit(event: Event) {
		event.preventDefault();
		pending = true;
		error = null;
		try {
			const payload = { ...values };
			const saved = form
				? await runtime().submitForm(form.key, payload, record?.id)
				: record
					? await runtime().update(type.key, record.id, payload)
					: await runtime().create(type.key, payload);
			onSaved?.(saved);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			pending = false;
		}
	}
</script>

<form class={cn("flex flex-col gap-6", fullWidth ? "w-full" : "max-w-xl")} onsubmit={submit}>
	<Field.Group>
		{#each visible as field (field.id)}
			{@const widget = fieldWidget(field)}
			<Field.Field>
				<Field.Label>{field.label}</Field.Label>
				{#if widget === "checkbox"}
					<Field.Field orientation="horizontal">
						<Switch bind:checked={values[field.key] as boolean} />
						<Field.Description>{values[field.key] ? "Yes" : "No"}</Field.Description>
					</Field.Field>
				{:else if widget === "reference"}
					<ReferencePicker
						bind:value={values[field.key] as string}
						options={refOptions[field.key] ?? []}
						placeholder={`Select ${field.label.toLowerCase()}`}
					/>
				{:else if widget === "select"}
					<AppSelect
						bind:value={values[field.key] as string}
						options={(refOptions[field.key] ?? []).map((option) => ({
							value: option.id,
							label: option.label,
						}))}
						placeholder={`Select ${field.label.toLowerCase()}`}
					/>
				{:else if widget === "rating"}
					<RatingInput
						bind:value={values[field.key]}
						max={field.max ?? 10}
						label={field.label}
						required={field.required}
					/>
				{:else}
					<Input
						class="w-full"
						type={widget === "number" ? "number" : widget === "date" ? "date" : "text"}
						required={field.required}
						bind:value={values[field.key] as string}
					/>
				{/if}
			</Field.Field>
		{/each}
	</Field.Group>
	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Title>Couldn't save</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}
	<div class="flex gap-2">
		<Button type="submit" disabled={pending} data-testid="record-submit">
			{#if pending}<Spinner data-icon="inline-start" />{/if}
			{submitLabel ?? (record ? "Save" : addLabel(type))}
		</Button>
		{#if onCancel}
			<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
		{/if}
	</div>
</form>
