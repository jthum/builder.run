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
	let advanced = $state(false);
	let deleteOpen = $state(false);

	const inputTypeDef = $derived(types.find((type) => type.key === inputType));
	const guardFieldDef = $derived(inputTypeDef?.fields.find((field) => field.key === guardField));

	$effect(() => {
		label = flow.label;
		kind = flowKind(flow);
		const name = Object.keys(flow.input ?? [])[0] ?? flow.trigger?.key.split(".")[0] ?? types[0]?.key ?? "";
		const definition = flow.input?.[name];
		inputType = definition && "record" in definition ? definition.record : name;
		const when = flow.trigger?.key ?? "";
		if (when.endsWith(".created")) triggerEvent = "created";
		else if (when.endsWith(".deleted")) triggerEvent = "deleted";
		else if (/\.[^.]+\.changed$/.test(when)) {
			triggerEvent = "field";
			triggerField = when.split(".").at(-2) ?? "";
		} else triggerEvent = "changed";
		const first = flow.steps[0];
		const guard = first && "gate" in first && !first.gate.fail ? first.gate : undefined;
		const condition = guard?.predicate;
		if (condition && "op" in condition && ["context.equals", "context.not_equals"].includes(condition.op)) {
			guardField = String(condition.path ?? "").split(".").at(-1) ?? "";
			guardOp = condition.op === "context.not_equals" ? "!=" : "==";
			guardValue = String(condition.value ?? "");
		} else {
			guardField = "";
			guardOp = "==";
			guardValue = "";
		}
		exposeUi = flow.expose?.includes("ui") ?? kind === "button";
		exposeAgent = flow.expose?.includes("agent") ?? true;
		const editableSteps = guard ? guard.pass ?? [] : flow.steps;
		advanced = Boolean(
			(flow.trigger?.config && Object.keys(flow.trigger.config).length) ||
			(flow.trigger &&
				![
					`${inputType}.created`,
					`${inputType}.changed`,
					`${inputType}.deleted`,
				].includes(flow.trigger.key) &&
				!new RegExp(`^${inputType}\\.[^.]+\\.changed$`).test(flow.trigger.key)) ||
			(name !== inputType) ||
			(definition && (!("record" in definition) || definition.required === false)) ||
			(flow.steps[0] && "gate" in flow.steps[0] && !guard) ||
			(guard && (flow.steps.length > 1 || Boolean(flow.steps[0]?.id))) ||
			(condition && !simpleCondition(condition)) ||
			 editableSteps.some((step) => !simpleAction(step, inputType)),
		);
		steps = editableSteps.length
			? editableSteps.map((step) => {
					if ("effect" in step && step.effect.key === "records.set") {
						const [field, value] = Object.entries((step.effect.params?.values as Record<string, unknown>) ?? {})[0] ?? ["", ""];
						return {
							kind: "set" as const,
							field,
							value: value && typeof value === "object" && "$ref" in value && value.$ref === "meta.now" ? "now" : String(value ?? ""),
							type: inputType,
						};
					}
					if ("effect" in step && step.effect.key === "records.create") {
						return { kind: "create" as const, field: "", value: "", type: String(step.effect.params?.type ?? "") };
					}
					return { kind: "set" as const, field: "", value: "", type: inputType };
				})
			: [{ kind: "set", field: "", value: "", type: inputType }];
	});

	function addStep() {
		steps = [...steps, { kind: "set", field: "", value: "", type: inputType }];
	}

	function simpleCondition(condition: Record<string, unknown>): boolean {
		return (
			"op" in condition &&
			["context.equals", "context.not_equals"].includes(String(condition.op)) &&
			typeof condition.path === "string" &&
			condition.path.startsWith(`vars.${inputType}.`) &&
			["string", "number", "boolean"].includes(typeof condition.value) &&
			Object.keys(condition).every((key) => ["op", "path", "value"].includes(key))
		);
	}

	function simpleAction(step: FlowStep, variable: string): boolean {
		if (step.id || !("effect" in step) || step.effect.as || step.effect.retry || step.effect.compensate) return false;
		if (step.effect.key === "records.create") {
			const fields = step.effect.params?.fields;
			return (
				typeof step.effect.params?.type === "string" &&
				fields !== null &&
				typeof fields === "object" &&
				!Array.isArray(fields) &&
				Object.keys(fields).length === 0 &&
				Object.keys(step.effect.params ?? {}).every((key) => ["type", "fields"].includes(key))
			);
		}
		if (step.effect.key !== "records.set") return false;
		const record = step.effect.params?.record;
		const values = step.effect.params?.values;
		if (
			!record ||
			typeof record !== "object" ||
			!("$ref" in record) ||
			record.$ref !== `vars.${variable}` ||
			!values ||
			typeof values !== "object" ||
			Array.isArray(values) ||
			Object.keys(values).length !== 1 ||
			!Object.keys(step.effect.params ?? {}).every((key) => ["record", "values"].includes(key))
		) return false;
		const value = Object.values(values)[0];
		return (
			["string", "number", "boolean"].includes(typeof value) ||
			(Boolean(value) &&
				typeof value === "object" &&
				"$ref" in value &&
				value.$ref === "meta.now" &&
				Object.keys(value).length === 1)
		);
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

	function guard() {
		if (!guardField || guardValue === "") return undefined;
		return {
			op: guardOp === "!=" ? "context.not_equals" : "context.equals",
			path: `vars.${inputType}.${guardField}`,
			value: typedValue(guardValue, guardFieldDef?.type),
		};
	}

	function typedValue(value: string, type?: string): string | number | boolean {
		if (type === "boolean") return value === "true";
		if (type === "number" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
		return value;
	}

	function compiledSteps(): FlowStep[] {
		const actions = steps
			.map((step) => {
				if (step.kind === "set" && step.field) {
					const field = inputTypeDef?.fields.find((item) => item.key === step.field);
					return {
						effect: {
							key: "records.set",
							params: {
								record: { $ref: `vars.${inputType}` },
								values: {
									[step.field]:
										step.value === "now"
											? { $ref: "meta.now" }
											: typedValue(step.value, field?.type),
								},
							},
						},
					} as FlowStep;
				}
				if (step.kind === "create" && step.type) {
					return { effect: { key: "records.create", params: { type: step.type, fields: {} } } } as FlowStep;
				}
				return null;
			})
			.filter(Boolean) as FlowStep[];
		const predicate = guard();
		return predicate ? [{ gate: { predicate, pass: actions } }] : actions;
	}

	async function save() {
		if (advanced) {
			toast.error("This flow uses advanced steps. Edit its spec to avoid losing them.");
			return;
		}
		const expose: Exposure[] = [
			...(exposeUi ? (["ui"] as const) : []),
			...(exposeAgent ? (["agent"] as const) : []),
		];
		await runtime().upsertFlow({
			key: flow.key,
			id: flow.id,
			label,
			input: inputType ? { [inputType]: { record: inputType } } : undefined,
			trigger: triggerWhen() ? { key: triggerWhen() as string } : undefined,
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
		input: inputType ? { [inputType]: { record: inputType } } : undefined,
		trigger: triggerWhen() ? { key: triggerWhen() as string } : undefined,
		steps: compiledSteps(),
	} as FlowDef);
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={label || flow.label} description={flowSummary(draft, spec)}>
		{#snippet actions()}
			<Button onclick={save} disabled={advanced}>Save</Button>
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
				{#if advanced}
					<p class="text-sm text-muted-foreground">This flow uses advanced composition. It remains intact and must be edited in the app spec for now.</p>
				{/if}
				{#each steps as step, index (index)}
					<div class="flex flex-col gap-3 rounded-xl border p-3">
						<div class="flex items-center justify-between">
							<Badge variant="secondary">{humanStep(
								step.kind === "set"
									? { effect: { key: "records.set", params: { record: { $ref: `vars.${inputType}` }, values: { [step.field]: step.value } } } }
									: { effect: { key: "records.create", params: { type: step.type, fields: {} } } },
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
