<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import type { FormDef } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const forms = $derived(spec?.forms ?? []);
	const flows = $derived(spec?.flows ?? []);

	let key = $state("");
	let label = $state("");
	let typeKey = $state("");
	let mode = $state<FormDef["mode"]>("create");
	let selected = $state<string[]>([]);
	let submitFlow = $state("");

	const sourceType = $derived(types.find((type) => type.key === typeKey));

	$effect(() => {
		if (!typeKey && types[0]) typeKey = types[0].key;
	});

	function toggle(field: string, on: boolean) {
		selected = on ? [...selected.filter((item) => item !== field), field] : selected.filter((item) => item !== field);
	}

	async function create() {
		await runtime().upsertForm({
			key: key || slugify(label),
			label,
			type: typeKey,
			mode,
			fields: selected.length ? selected : (sourceType?.fields.map((field) => field.key) ?? []),
			submit: submitFlow ? { flow: submitFlow } : undefined,
		});
		key = "";
		label = "";
		selected = [];
		submitFlow = "";
		toast.success("Form saved");
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Forms</h1>
		<p class="text-muted-foreground">Reusable input. Types already get default create and edit forms.</p>
	</div>
	<div class="flex flex-col gap-2">
		{#each forms as form (form.id)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href="/build/forms/{form.key}">
				<div class="font-medium">{form.label}</div>
				<div class="text-sm text-muted-foreground">
					{form.key} · {form.mode} · {form.type}{form.implicit ? " · default" : ""}
					{form.submit?.flow ? ` · ${form.submit.flow}` : ""}
				</div>
			</a>
		{/each}
	</div>
	<div class="max-w-xl">
		<Field.Group>
			<Field.Field>
				<Field.Label>Label</Field.Label>
				<Input bind:value={label} placeholder="New project" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Key</Field.Label>
				<Input bind:value={key} placeholder="new_project" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Type</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={typeKey}>
					{#each types as type (type.id)}
						<NativeSelect.Option value={type.key}>{type.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Mode</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={mode}>
					<NativeSelect.Option value="create">Create</NativeSelect.Option>
					<NativeSelect.Option value="edit">Edit</NativeSelect.Option>
					<NativeSelect.Option value="custom">Custom</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Fields</Field.Label>
				<div class="flex flex-col gap-2">
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
				<Field.Label>Submit flow</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={submitFlow}>
					<NativeSelect.Option value="">Record save only</NativeSelect.Option>
					{#each flows as flow (flow.id)}
						<NativeSelect.Option value={flow.key}>{flow.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Button onclick={create}>Create form</Button>
		</Field.Group>
	</div>
</div>
