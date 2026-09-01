<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { FIELD_KINDS, type FieldKind, type TypeDef } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	let { type }: { type: TypeDef } = $props();

	let fieldKey = $state("");
	let fieldLabel = $state("");
	let fieldType = $state<FieldKind>("text");
	let fieldRequired = $state(false);
	let fieldValues = $state("");
	let fieldTarget = $state("");

	const targets = $derived(session.snapshot?.spec.types ?? []);

	async function addField() {
		if (!fieldKey) return;
		await runtime().upsertField(type.key, {
			key: fieldKey,
			label: fieldLabel || undefined,
			type: fieldType,
			required: fieldRequired,
			values: fieldType === "enum" ? fieldValues.split(",").map((value) => value.trim()).filter(Boolean) : undefined,
			target: fieldType === "reference" ? fieldTarget : undefined,
		});
		fieldKey = "";
		fieldLabel = "";
		fieldValues = "";
		toast.success("Field saved");
	}
</script>

<div class="flex flex-col gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>{type.label}</Card.Title>
			<Card.Description>
				<code>{type.key}</code>
				in store
				<code>{type.store}</code>
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#each type.fields as field (field.id)}
				<div class="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
					<div>
						<div class="font-medium">{field.label}</div>
						<div class="text-muted-foreground">{field.key} · {field.type}{field.target ? ` → ${field.target}` : ""}</div>
					</div>
					<div class="flex items-center gap-2">
						{#if field.required}
							<span class="text-xs text-muted-foreground">required</span>
						{/if}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => runtime().deleteField(type.key, field.key)}>Remove</Button
						>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Add field</Card.Title>
		</Card.Header>
		<Card.Content>
			<Field.Group>
				<Field.Field>
					<Field.Label>Key</Field.Label>
					<Input bind:value={fieldKey} placeholder="due_date" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Label</Field.Label>
					<Input bind:value={fieldLabel} placeholder="Due date" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Type</Field.Label>
					<NativeSelect.Root class="w-full" bind:value={fieldType}>
						{#each FIELD_KINDS as kind (kind)}
							<NativeSelect.Option value={kind}>{kind}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
				{#if fieldType === "enum"}
					<Field.Field>
						<Field.Label>Values</Field.Label>
						<Input bind:value={fieldValues} placeholder="draft, sent, paid" />
					</Field.Field>
				{/if}
				{#if fieldType === "reference"}
					<Field.Field>
						<Field.Label>Target</Field.Label>
						<NativeSelect.Root class="w-full" bind:value={fieldTarget}>
							<NativeSelect.Option value="">Select type</NativeSelect.Option>
							{#each targets as target (target.id)}
								<NativeSelect.Option value={target.store === "directory" ? `${target.store}.${target.key}` : target.key}>
									{target.label}
								</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</Field.Field>
				{/if}
				<Field.Field orientation="horizontal">
					<Checkbox bind:checked={fieldRequired} id="required" />
					<Field.Label for="required">Required</Field.Label>
				</Field.Field>
				<Button onclick={addField}>Add field</Button>
			</Field.Group>
		</Card.Content>
	</Card.Root>
</div>
