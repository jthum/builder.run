<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import { toast } from "svelte-sonner";

	const types = $derived(session.snapshot?.spec.types ?? []);
	const views = $derived(session.snapshot?.spec.views ?? []);

	let key = $state("");
	let label = $state("");
	let source = $state("");
	let selected = $state<string[]>([]);
	let whereField = $state("");
	let whereValue = $state("");

	const sourceType = $derived(types.find((type) => type.key === source));
	const fieldChoices = $derived(
		(sourceType?.fields ?? []).flatMap((field) =>
			field.type === "reference" ? [field.key, `${field.key}.name`] : [field.key],
		),
	);

	$effect(() => {
		if (!source && types[0]) source = types[0].key;
	});

	function toggle(field: string, on: boolean) {
		selected = on ? [...selected.filter((item) => item !== field), field] : selected.filter((item) => item !== field);
	}

	async function create() {
		const resolved = key || slugify(label);
		await runtime().upsertView({
			key: resolved,
			label,
			source,
			fields: selected,
			where: whereField && whereValue ? { [whereField]: whereValue } : undefined,
		});
		key = "";
		label = "";
		selected = [];
		whereField = "";
		whereValue = "";
		toast.success("View saved");
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Views</h1>
		<p class="text-muted-foreground">Saved lists with filters, so people see what matters.</p>
	</div>
	<div class="flex flex-col gap-2">
		{#each views as view (view.id)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href="/v/{view.key}">
				<div class="font-medium">{view.label}</div>
				<div class="text-sm text-muted-foreground">
					{types.find((type) => type.key === view.source)?.label ?? view.source}
					{view.implicit ? " · built-in list" : ""}
				</div>
			</a>
		{/each}
	</div>
	<div class="max-w-xl">
		<Field.Group>
			<Field.Field>
				<Field.Label>Label</Field.Label>
				<Input bind:value={label} placeholder="Active projects" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Key</Field.Label>
				<Input bind:value={key} placeholder="active_projects" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Source type</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={source}>
					{#each types as type (type.id)}
						<NativeSelect.Option value={type.key}>{type.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Fields</Field.Label>
				<div class="flex flex-col gap-2">
					{#each fieldChoices as field (field)}
						<Field.Field orientation="horizontal">
							<Checkbox
								checked={selected.includes(field)}
								onCheckedChange={(value) => toggle(field, Boolean(value))}
							/>
							<Field.Label class="font-normal">{field}</Field.Label>
						</Field.Field>
					{/each}
				</div>
			</Field.Field>
			<Field.Field>
				<Field.Label>Filter field</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={whereField}>
					<NativeSelect.Option value="">None</NativeSelect.Option>
					{#each sourceType?.fields ?? [] as field (field.id)}
						<NativeSelect.Option value={field.key}>{field.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			{#if whereField}
				<Field.Field>
					<Field.Label>Equals</Field.Label>
					<Input bind:value={whereValue} placeholder="active" />
				</Field.Field>
			{/if}
			<Button onclick={create}>Create view</Button>
		</Field.Group>
	</div>
</div>
