<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { fieldWidget, findType } from "$lib/runtime/query.ts";
	import type { FieldDef, RecordValue, TypeDef } from "$lib/runtime/model.ts";

	let {
		type,
		record = null,
		fields,
		onSaved,
	}: {
		type: TypeDef;
		record?: RecordValue | null;
		fields?: string[];
		onSaved?: (record: RecordValue) => void;
	} = $props();

	const keys = $derived(fields?.length ? fields : type.fields.map((field) => field.key));
	const visible = $derived(keys.map((key) => type.fields.find((field) => field.key === key)).filter(Boolean) as FieldDef[]);

	let values = $state<Record<string, unknown>>({});
	let error = $state<string | null>(null);
	let pending = $state(false);

	$effect(() => {
		const next: Record<string, unknown> = {};
		for (const field of type.fields) {
			next[field.key] = record?.[field.key] ?? field.default ?? (field.type === "boolean" ? false : "");
		}
		values = next;
	});

	async function optionsFor(field: FieldDef) {
		if (field.type === "enum") return (field.values ?? []).map((value) => ({ id: value, label: value }));
		if (field.type !== "reference" || !field.target || !session.host) return [];
		const ctx = runtime().queryContext();
		const target = findType(ctx, field.target);
		if (!target) return [];
		const rows = await runtime().listRecords(target.key);
		return rows.map((row) => ({
			id: row.id,
			label: String(row.name ?? row.title ?? row.email ?? row.id),
		}));
	}

	let refOptions = $state<Record<string, Array<{ id: string; label: string }>>>({});

	$effect(() => {
		void session.revision;
		void (async () => {
			const next: Record<string, Array<{ id: string; label: string }>> = {};
			for (const field of visible) {
				if (field.type === "reference" || field.type === "enum") {
					next[field.key] = await optionsFor(field);
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
			const saved = record
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

<form class="flex max-w-xl flex-col gap-6" onsubmit={submit}>
	<Field.Group>
		{#each visible as field (field.id)}
			{@const widget = fieldWidget(field)}
			<Field.Field>
				<Field.Label>{field.label}</Field.Label>
				{#if widget === "checkbox"}
					<Checkbox bind:checked={values[field.key] as boolean} />
				{:else if widget === "select" || widget === "reference"}
					<NativeSelect.Root class="w-full" bind:value={values[field.key] as string}>
						<NativeSelect.Option value="">Select {field.label}</NativeSelect.Option>
						{#each refOptions[field.key] ?? [] as option (option.id)}
							<NativeSelect.Option value={option.id}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				{:else}
					<Input
						class="w-full"
						type={widget === "number" ? "number" : widget === "date" ? "date" : "text"}
						bind:value={values[field.key] as string}
					/>
				{/if}
			</Field.Field>
		{/each}
	</Field.Group>
	{#if error}
		<p class="text-sm text-destructive">{error}</p>
	{/if}
	<div class="flex gap-2">
		<Button type="submit" disabled={pending}>
			{#if pending}<Spinner data-icon="inline-start" />{/if}
			{record ? "Save" : "Create"}
		</Button>
	</div>
</form>
