<script lang="ts">
	import { goto } from "$app/navigation";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import EditorActions from "$lib/components/editor-actions.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { FormDef } from "$lib/runtime/model.ts";
	import { stableStringify } from "$lib/utils.ts";
	import { toast } from "svelte-sonner";

	let { form }: { form: FormDef } = $props();

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const flows = $derived(spec?.flows ?? []);

	let label = $state("");
	let typeKey = $state("");
	let mode = $state("create");
	let selected = $state<string[]>([]);
	let submitFlow = $state("");
	let deleteOpen = $state(false);

	$effect(() => {
		label = form.label;
		typeKey = form.type;
		mode = form.mode;
		selected = [...form.fields];
		submitFlow = form.submit?.flow ?? "";
	});

	const sourceType = $derived(
		types.find((item) => item.key === typeKey) ?? types.find((item) => item.key === form.type),
	);
	const draft = $derived({
		...form,
		label,
		type: typeKey,
		mode: mode as FormDef["mode"],
		fields: selected.length ? selected : (sourceType?.fields.map((field) => field.key) ?? []),
		submit: submitFlow ? { flow: submitFlow } : undefined,
	});
	const dirty = $derived(stableStringify(draft) !== stableStringify(form));

	function toggle(field: string, on: boolean) {
		selected = on
			? selected.includes(field)
				? selected
				: [...selected, field]
			: selected.filter((item) => item !== field);
	}

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
		description={mode === "create" ? "Shown when someone adds a record." : "Shown when someone edits a record."}
	/>

	<div class="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
		<Field.Group>
			<Field.Field>
				<Field.Label>Name</Field.Label>
				<Input bind:value={label} />
			</Field.Field>
			<Field.Field>
				<Field.Label>Record type</Field.Label>
				<AppSelect
					bind:value={typeKey}
					options={types.map((type) => ({ value: type.key, label: type.label }))}
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label>Used for</Field.Label>
				<AppSelect
					bind:value={mode}
					options={[
						{ value: "create", label: "Adding" },
						{ value: "edit", label: "Editing" },
						{ value: "custom", label: "Custom" },
					]}
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label>Fields</Field.Label>
				<div class="flex flex-col gap-2 rounded-xl border p-3">
					{#each sourceType?.fields ?? [] as field (field.id)}
						<Field.Field orientation="horizontal">
							<Checkbox
								checked={selected.includes(field.key)}
								onCheckedChange={(value) => toggle(field.key, Boolean(value))}
							/>
							<Field.Label class="font-normal">{field.label}</Field.Label>
						</Field.Field>
					{/each}
				</div>
			</Field.Field>
			<Field.Field>
				<Field.Label>After save</Field.Label>
				<AppSelect
					bind:value={submitFlow}
					options={[
						{ value: "", label: "Just save the record" },
						...flows.map((item) => ({ value: item.key, label: item.label })),
					]}
				/>
			</Field.Field>
		</Field.Group>
		<div class="flex min-w-0 flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Preview</h2>
			{#if sourceType}
				<RecordForm
					type={sourceType}
					form={{ ...form, label, type: typeKey, mode: mode as FormDef["mode"], fields: selected }}
					fields={selected}
				/>
			{/if}
		</div>
	</div>

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
