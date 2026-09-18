<script lang="ts">
	import { addLabel, recordTitle } from "$lib/app/labels.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { OptionSelect } from "@jthum/framework/svelte/studio";
	import ReferencePicker from "$lib/components/reference-picker.svelte";
	import RatingInput from "$lib/components/rating-input.svelte";
	import * as Alert from "@jthum/framework/svelte/ui/alert";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";
	import { Textarea } from "@jthum/framework/svelte/ui/textarea";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { Switch } from "@jthum/framework/svelte/ui/switch";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { CollectionDraft, FieldDraft, FormDraft } from "@jthum/framework/svelte/studio";
	import { resolveFieldState } from "$lib/runtime/field-state.ts";
	import { fieldWidget } from "$lib/runtime/query.ts";
	import { cn } from "$lib/utils.ts";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";

	let {
		type = null,
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
		type?: CollectionDraft | null;
		record?: Record<string, unknown> | null;
		fields?: string[];
		form?: FormDraft | null;
		defaults?: Record<string, unknown>;
		omit?: string[];
		onSaved?: (record: Record<string, unknown> | null) => void;
		onCancel?: () => void;
		submitLabel?: string;
		fullWidth?: boolean;
	} = $props();

	const definitions = $derived(form?.mode === "standalone" ? (form.inputs ?? []) : (type?.fields ?? []));
	const keys = $derived(
		(fields?.length ? fields : definitions.map((field) => field.key)).filter(
			(key) => !omit.includes(key),
		),
	);
	const configuredFields = $derived(
		keys
			.filter((key) => key !== type?.lifecycle?.field)
			.map((key) => definitions.find((field) => field.key === key))
		.filter(Boolean) as FieldDraft[],
	);
	let values = $state<Record<string, unknown>>({});
	const visible = $derived(configuredFields.filter((field) => resolveFieldState(field, values).visible));
	const optionKeys = $derived(
		visible
			.filter((field) => field.type === "reference" || field.type === "enum")
			.map((field) => field.key)
			.join(","),
	);

	function formValues(
		current: FieldDraft[],
		row: Record<string, unknown> | null | undefined,
		initial: Record<string, unknown>,
	): Record<string, unknown> {
		const next: Record<string, unknown> = {};
		for (const field of current) {
			if (field.key === type?.lifecycle?.field) continue;
			const raw = row?.[field.key] ?? initial[field.key] ?? field.default;
			if (field.type === "boolean") next[field.key] = Boolean(raw);
			else next[field.key] = raw ?? "";
		}
		return next;
	}

	let error = $state<string | null>(null);
	let pending = $state(false);
	let submitted = $state(false);
	const defaultsKey = $derived(JSON.stringify(defaults));
	const recordId = $derived(record?.id ? String(record.id) : "");
	const formKey = $derived(form?.key ?? "");

	$effect.pre(() => {
		void recordId;
		void formKey;
		const initial = JSON.parse(defaultsKey) as Record<string, unknown>;
		values = formValues(definitions, record, initial);
		submitted = false;
	});

	$effect(() => {
		const clear = configuredFields.filter(
			(field) =>
				field.hidden_value === "clear" &&
				!resolveFieldState(field, values).visible &&
				values[field.key] !== null &&
				values[field.key] !== "",
		);
		if (!clear.length) return;
		values = { ...values, ...Object.fromEntries(clear.map((field) => [field.key, null])) };
	});

	async function optionsFor(field: FieldDraft) {
		if (field.type === "enum") {
			return (field.values ?? []).map((value) => ({ id: value, label: labelFromKey(value) }));
		}
		if (field.type !== "reference" || !field.target) return [];
		const target = canonicalStudio.context?.collections.find((item) => item.key === field.target);
		if (!target) return [];
		const rows = await canonicalStudio.listRecords(target.key);
		return rows.map((row) => ({
			id: String(row.id),
			label: recordTitle(row, target),
		}));
	}

	let refOptions = $state<Record<string, Array<{ id: string; label: string }>>>({});

	$effect(() => {
		void canonicalStudio.revision;
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
				? await canonicalStudio.submitForm(form.key, payload, recordId || undefined)
				: record && type
					? await canonicalStudio.updateRecord(type.key, recordId, payload)
					: type
						? await canonicalStudio.createRecord(type.key, payload)
						: null;
			if (form?.mode === "standalone") {
				values = formValues(definitions, null, {});
				submitted = true;
			}
			onSaved?.(saved);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			pending = false;
		}
	}
</script>

{#if form?.mode === "standalone" && submitted}
	<Alert.Root class={cn(fullWidth ? "w-full" : "max-w-xl", "border-primary/15 bg-primary/5")}>
		<CircleCheckIcon />
		<Alert.Title>{form.submit?.success?.title ?? "Response submitted"}</Alert.Title>
		<Alert.Description>{form.submit?.success?.description ?? "Thank you. Your response has been received."}</Alert.Description>
		<Alert.Action><Button variant="outline" size="sm" onclick={() => (submitted = false)}>Submit another response</Button></Alert.Action>
	</Alert.Root>
{:else}
	<form class={cn("flex flex-col gap-6", fullWidth ? "w-full" : "max-w-xl")} onsubmit={submit}>
		<Field.Group>
			{#each visible as field (field.id)}
				{@const widget = fieldWidget(field)}
				{@const state = resolveFieldState(field, values)}
				<Field.Field>
					<Field.Label>{field.label}</Field.Label>
					{#if widget === "checkbox"}
						<Field.Field orientation="horizontal">
							<Switch bind:checked={values[field.key] as boolean} disabled={!state.enabled} />
							<Field.Description>{values[field.key] ? "Yes" : "No"}</Field.Description>
						</Field.Field>
					{:else if widget === "reference"}
						<ReferencePicker
							bind:value={values[field.key] as string}
							options={refOptions[field.key] ?? []}
							placeholder={`Select ${field.label.toLowerCase()}`}
							required={state.required}
							disabled={!state.enabled}
						/>
					{:else if widget === "select"}
						<OptionSelect
							bind:value={values[field.key] as string}
							options={(refOptions[field.key] ?? []).map((option) => ({
								value: option.id,
								label: option.label,
							}))}
							placeholder={`Select ${field.label.toLowerCase()}`}
							required={state.required}
							disabled={!state.enabled}
						/>
					{:else if widget === "rating"}
						<RatingInput
							bind:value={values[field.key]}
							max={field.max ?? 10}
							label={field.label}
							required={state.required}
							disabled={!state.enabled}
						/>
					{:else if widget === "textarea"}
						<Textarea
							class="min-h-24 w-full"
							placeholder={field.placeholder}
							required={state.required}
							disabled={!state.enabled}
							minlength={field.validation?.min_length}
							maxlength={field.validation?.max_length}
							bind:value={values[field.key] as string}
						/>
					{:else}
						<Input
							class="w-full"
							type={widget === "number"
								? "number"
								: widget === "date"
									? "date"
									: widget === "datetime"
										? "datetime-local"
										: field.format === "email"
											? "email"
											: field.format === "url"
												? "url"
												: field.format === "phone"
													? "tel"
													: "text"}
							placeholder={field.placeholder}
							required={state.required}
							disabled={!state.enabled}
							min={field.validation?.min}
							max={field.validation?.max}
							minlength={field.validation?.min_length}
							maxlength={field.validation?.max_length}
							pattern={field.validation?.pattern}
							bind:value={values[field.key] as string}
						/>
					{/if}
					{#if field.description}<Field.Description>{field.description}</Field.Description>{/if}
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
				{submitLabel ?? (record ? "Save" : type ? addLabel(type) : "Submit")}
			</Button>
			{#if onCancel}
				<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
			{/if}
		</div>
	</form>
{/if}
