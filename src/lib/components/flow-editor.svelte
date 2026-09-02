<script lang="ts">
	import { goto } from "$app/navigation";
	import { flowKind, flowSummary, humanStep } from "$lib/app/relations.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { Exposure, FlowDef, FlowStep } from "$lib/runtime/model.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	let { flow }: { flow: FlowDef } = $props();

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);

	let label = $state("");
	let kind = $state<"button" | "rule">("button");
	let inputType = $state("");
	let triggerEvent = $state("field");
	let triggerField = $state("");
	let guardField = $state("");
	let guardOp = $state("==");
	let guardValue = $state("");
	let exposeUi = $state(true);
	let exposeAgent = $state(true);
	let steps = $state<Array<{ kind: string; field: string; value: string; type: string }>>([]);
	let deleteOpen = $state(false);

	const inputTypeDef = $derived(types.find((type) => type.key === inputType));
	const guardFieldDef = $derived(inputTypeDef?.fields.find((field) => field.key === guardField));

	$effect(() => {
		label = flow.label;
		kind = flowKind(flow);
		const name = Object.keys(flow.input ?? [])[0] ?? flow.trigger?.when.split(".")[0] ?? types[0]?.key ?? "";
		const expr = flow.input?.[name] ?? "";
		const fromRef = /ref\((.+)\)/.exec(expr)?.[1];
		inputType = fromRef ?? name ?? types[0]?.key ?? "";
		const when = flow.trigger?.when ?? "";
		if (when.endsWith(".created")) triggerEvent = "created";
		else if (when.endsWith(".deleted")) triggerEvent = "deleted";
		else if (/\.[^.]+\.changed$/.test(when)) {
			triggerEvent = "field";
			triggerField = when.split(".").at(-2) ?? "";
		} else triggerEvent = "changed";
		const guard = typeof flow.when === "string" ? flow.when : "";
		const match = guard.match(/^\s*(.+?)\s*(==|!=)\s*(.+?)\s*$/);
		if (match) {
			guardField = match[1].split(".").at(-1) ?? "";
			guardOp = match[2];
			guardValue = match[3].replace(/^['"]|['"]$/g, "");
		} else {
			guardField = "";
			guardOp = "==";
			guardValue = "";
		}
		exposeUi = flow.expose?.includes("ui") ?? kind === "button";
		exposeAgent = flow.expose?.includes("agent") ?? true;
		steps = flow.steps.length
			? flow.steps.map((step) => {
					if ("set" in step) {
						const [path, value] = Object.entries(step.set)[0] ?? ["", ""];
						return {
							kind: "set" as const,
							field: path.split(".").at(-1) ?? "",
							value: String(value ?? ""),
							type: inputType,
						};
					}
					if ("create" in step) {
						return { kind: "create" as const, field: "", value: "", type: step.create.type };
					}
					return { kind: "set" as const, field: "", value: "", type: inputType };
				})
			: [{ kind: "set", field: "", value: "", type: inputType }];
	});

	function addStep() {
		steps = [...steps, { kind: "set", field: "", value: "", type: inputType }];
	}

	function removeStep(index: number) {
		steps = steps.filter((_, i) => i !== index);
	}

	function triggerWhen(): string | undefined {
		if (kind !== "rule" || !inputType) return undefined;
		if (triggerEvent === "created") return `${inputType}.created`;
		if (triggerEvent === "deleted") return `${inputType}.deleted`;
		if (triggerEvent === "field" && triggerField) return `${inputType}.${triggerField}.changed`;
		return `${inputType}.changed`;
	}

	function guard(): string | undefined {
		if (!guardField || guardValue === "") return undefined;
		return `${inputType}.${guardField} ${guardOp} ${guardValue}`;
	}

	function compiledSteps(): FlowStep[] {
		return steps
			.map((step) => {
				if (step.kind === "set" && step.field) {
					return { set: { [`${inputType}.${step.field}`]: step.value } } as FlowStep;
				}
				if (step.kind === "create" && step.type) {
					return { create: { type: step.type, fields: {} } } as FlowStep;
				}
				return null;
			})
			.filter(Boolean) as FlowStep[];
	}

	async function save() {
		const expose: Exposure[] = [
			...(exposeUi ? (["ui"] as const) : []),
			...(exposeAgent ? (["agent"] as const) : []),
		];
		await runtime().upsertFlow({
			key: flow.key,
			id: flow.id,
			label,
			input: inputType ? { [inputType]: `ref(${inputType})` } : undefined,
			trigger: triggerWhen() ? { when: triggerWhen() as string } : undefined,
			when: guard(),
			expose: kind === "button" && expose.length ? expose : exposeAgent ? ["agent"] : undefined,
			steps: compiledSteps(),
		});
		toast.success("Saved");
	}

	async function remove() {
		await runtime().deleteFlow(flow.key);
		toast.success("Deleted");
		await goto("/build/flows");
	}

	const draft = $derived({
		...flow,
		label,
		input: inputType ? { [inputType]: `ref(${inputType})` } : undefined,
		trigger: triggerWhen() ? { when: triggerWhen() as string } : undefined,
		when: guard(),
		steps: compiledSteps(),
	} as FlowDef);
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={label || flow.label} description={flowSummary(draft, spec)}>
		{#snippet actions()}
			<Button onclick={save}>Save</Button>
			<Button variant="ghost" onclick={() => (deleteOpen = true)}>Delete</Button>
		{/snippet}
	</PageHeader>

	<div class="flex flex-wrap gap-2">
		<Button size="sm" variant={kind === "button" ? "default" : "outline"} onclick={() => (kind = "button")}>
			Button
		</Button>
		<Button size="sm" variant={kind === "rule" ? "default" : "outline"} onclick={() => (kind = "rule")}>
			When this happens
		</Button>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{kind === "button" ? "Button" : "When"}</Card.Title>
				<Card.Description>
					{kind === "button"
						? "People tap this on a record."
						: "Runs by itself when a record changes."}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Field.Group>
					<Field.Field>
						<Field.Label>Name</Field.Label>
						<Input bind:value={label} placeholder={kind === "button" ? "Mark invoice paid" : "Record paid date"} />
					</Field.Field>
					<Field.Field>
						<Field.Label>{kind === "button" ? "Show on" : "Watch"}</Field.Label>
						<AppSelect
							bind:value={inputType}
							options={types.map((type) => ({ value: type.key, label: type.label }))}
						/>
					</Field.Field>
					{#if kind === "rule"}
						<Field.Field>
							<Field.Label>When</Field.Label>
							<AppSelect
								bind:value={triggerEvent}
								options={[
									{ value: "created", label: "A record is added" },
									{ value: "changed", label: "A record changes" },
									{ value: "field", label: "A field changes" },
									{ value: "deleted", label: "A record is deleted" },
								]}
							/>
						</Field.Field>
						{#if triggerEvent === "field"}
							<Field.Field>
								<Field.Label>Field</Field.Label>
								<AppSelect
									bind:value={triggerField}
									options={(inputTypeDef?.fields ?? []).map((field) => ({
										value: field.key,
										label: field.label,
									}))}
									placeholder="Select a field"
								/>
							</Field.Field>
						{/if}
					{/if}
					<Field.Field>
						<Field.Label>Only if</Field.Label>
						<AppSelect
							bind:value={guardField}
							options={[
								{ value: "", label: "Always" },
								...(inputTypeDef?.fields ?? []).map((field) => ({
									value: field.key,
									label: field.label,
								})),
							]}
						/>
					</Field.Field>
					{#if guardField}
						<Field.Field>
							<Field.Label>Condition</Field.Label>
							<AppSelect
								bind:value={guardOp}
								options={[
									{ value: "==", label: "is" },
									{ value: "!=", label: "is not" },
								]}
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label>Value</Field.Label>
							{#if guardFieldDef?.type === "enum"}
								<AppSelect
									bind:value={guardValue}
									options={(guardFieldDef.values ?? []).map((value) => ({
										value,
										label: labelFromKey(value),
									}))}
								/>
							{:else if guardFieldDef?.type === "boolean"}
								<AppSelect
									bind:value={guardValue}
									options={[
										{ value: "true", label: "Yes" },
										{ value: "false", label: "No" },
									]}
								/>
							{:else}
								<Input bind:value={guardValue} />
							{/if}
						</Field.Field>
					{/if}
					{#if kind === "button"}
						<Field.Field orientation="horizontal">
							<Switch bind:checked={exposeUi} />
							<Field.Label class="font-normal">Show as a button on the record</Field.Label>
						</Field.Field>
					{/if}
					<Field.Field orientation="horizontal">
						<Switch bind:checked={exposeAgent} />
						<Field.Label class="font-normal">Available to agents</Field.Label>
					</Field.Field>
				</Field.Group>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Then</Card.Title>
				<Card.Description>What happens, in order.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#each steps as step, index (index)}
					<div class="flex flex-col gap-3 rounded-xl border p-3">
						<div class="flex items-center justify-between">
							<Badge variant="secondary">{humanStep(
								step.kind === "set"
									? { set: { [`${inputType}.${step.field}`]: step.value } }
									: { create: { type: step.type, fields: {} } },
								spec,
							)}</Badge>
							<Button size="xs" variant="ghost" onclick={() => removeStep(index)}>Remove</Button>
						</div>
						<AppSelect
							bind:value={step.kind}
							options={[
								{ value: "set", label: "Set a field" },
								{ value: "create", label: "Create a record" },
							]}
						/>
						{#if step.kind === "set"}
							<AppSelect
								bind:value={step.field}
								options={(inputTypeDef?.fields ?? []).map((field) => ({
									value: field.key,
									label: field.label,
								}))}
								placeholder="Field"
							/>
							{#if inputTypeDef?.fields.find((field) => field.key === step.field)?.type === "enum"}
								<AppSelect
									bind:value={step.value}
									options={(inputTypeDef.fields.find((field) => field.key === step.field)?.values ?? []).map(
										(value) => ({ value, label: labelFromKey(value) }),
									)}
									placeholder="Value"
								/>
							{:else if inputTypeDef?.fields.find((field) => field.key === step.field)?.type === "date"}
								<AppSelect
									bind:value={step.value}
									options={[
										{ value: "now", label: "Today" },
										{ value: "", label: "Empty" },
									]}
								/>
							{:else}
								<Input bind:value={step.value} placeholder="Value" />
							{/if}
						{:else}
							<AppSelect
								bind:value={step.type}
								options={types.map((type) => ({ value: type.key, label: type.label }))}
							/>
						{/if}
					</div>
				{/each}
				<Button variant="outline" size="sm" onclick={addStep}>
					<PlusIcon data-icon="inline-start" />
					Add step
				</Button>
			</Card.Content>
		</Card.Root>
	</div>
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {flow.label}?</AlertDialog.Title>
			<AlertDialog.Description>The button or automation is removed. Records stay.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
