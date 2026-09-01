<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import type { Exposure, FlowStep } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const flows = $derived(spec?.flows ?? []);

	let key = $state("");
	let label = $state("");
	let inputName = $state("");
	let inputType = $state("");
	let trigger = $state("");
	let guard = $state("");
	let exposeUi = $state(true);
	let exposeAgent = $state(true);
	let stepKind = $state<"set" | "create">("set");
	let setPath = $state("");
	let setValue = $state("");
	let createType = $state("");

	$effect(() => {
		if (!inputType && types[0]) inputType = types[0].key;
		if (!createType && types[0]) createType = types[0].key;
	});

	async function create() {
		const expose: Exposure[] = [
			...(exposeUi ? (["ui"] as const) : []),
			...(exposeAgent ? (["agent"] as const) : []),
		];
		const steps: FlowStep[] =
			stepKind === "set" && setPath
				? [{ set: { [setPath]: setValue } }]
				: stepKind === "create" && createType
					? [{ create: { type: createType, fields: {} } }]
					: [];
		await runtime().upsertFlow({
			key: key || slugify(label),
			label,
			input: inputName && inputType ? { [inputName]: `ref(${inputType})` } : undefined,
			trigger: trigger ? { when: trigger } : undefined,
			when: guard || undefined,
			expose: expose.length ? expose : undefined,
			steps,
		});
		key = "";
		label = "";
		trigger = "";
		guard = "";
		setPath = "";
		setValue = "";
		toast.success("Flow saved");
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Actions</h1>
		<p class="text-muted-foreground">
			Buttons people tap, and automations that run themselves.
		</p>
	</div>
	<div class="flex flex-col gap-2">
		{#each flows as flow (flow.id)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href="/build/flows/{flow.key}">
				<div class="font-medium">{flow.label}</div>
				<div class="text-sm text-muted-foreground">
					{flow.trigger ? "Runs automatically" : "Button action"}
				</div>
			</a>
		{/each}
	</div>
	<div class="max-w-xl">
		<Field.Group>
			<Field.Field>
				<Field.Label>Label</Field.Label>
				<Input bind:value={label} placeholder="Mark invoice paid" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Key</Field.Label>
				<Input bind:value={key} placeholder="mark_invoice_paid" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Input name</Field.Label>
				<Input bind:value={inputName} placeholder="invoice" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Input type</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={inputType}>
					{#each types as type (type.id)}
						<NativeSelect.Option value={type.key}>{type.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Trigger</Field.Label>
				<Input bind:value={trigger} placeholder="invoice.status.changed" />
				<Field.Description>Leave blank for a callable flow.</Field.Description>
			</Field.Field>
			<Field.Field>
				<Field.Label>Guard</Field.Label>
				<Input bind:value={guard} placeholder="invoice.status == paid" />
			</Field.Field>
			<Field.Field orientation="horizontal">
				<Checkbox bind:checked={exposeUi} />
				<Field.Label class="font-normal">Expose to UI</Field.Label>
			</Field.Field>
			<Field.Field orientation="horizontal">
				<Checkbox bind:checked={exposeAgent} />
				<Field.Label class="font-normal">Expose to agents</Field.Label>
			</Field.Field>
			<Field.Field>
				<Field.Label>First step</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={stepKind}>
					<NativeSelect.Option value="set">Set a field</NativeSelect.Option>
					<NativeSelect.Option value="create">Create a record</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>
			{#if stepKind === "set"}
				<Field.Field>
					<Field.Label>Path</Field.Label>
					<Input bind:value={setPath} placeholder="invoice.status" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Value</Field.Label>
					<Input bind:value={setValue} placeholder="paid" />
				</Field.Field>
			{:else}
				<Field.Field>
					<Field.Label>Create type</Field.Label>
					<NativeSelect.Root class="w-full" bind:value={createType}>
						{#each types as type (type.id)}
							<NativeSelect.Option value={type.key}>{type.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<Button onclick={create}>Create flow</Button>
		</Field.Group>
	</div>
</div>
