<script lang="ts">
	import { goto } from "$app/navigation";
	import { flowKind, flowSummary } from "$lib/app/relations.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AutomationPredicateEditor from "$lib/components/automation-predicate-editor.svelte";
	import AutomationStepList from "$lib/components/automation-step-list.svelte";
	import AutomationValueMapEditor from "$lib/components/automation-value-map-editor.svelte";
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { BROWSER_LOCAL_AUTOMATION_PROFILE, checkAutomationCompatibility } from "$lib/runtime/automation/index.ts";
	import type { AutomationPredicate, AutomationValue } from "$lib/runtime/automation/model.ts";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import { cloneData, type Exposure, type FlowDef, type FlowStep } from "$lib/runtime/model.ts";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";
	import ZapIcon from "@lucide/svelte/icons/zap";
	import { toast } from "svelte-sonner";

	let { flow }: { flow: FlowDef } = $props();
	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const flows = $derived(spec?.flows ?? []);

	let initializedFlow = $state("");
	let label = $state("");
	let description = $state("");
	let enabled = $state(true);
	let kind = $state<"button" | "rule">("rule");
	let inputName = $state("");
	let inputType = $state("");
	let inputEditable = $state(true);
	let preserveMissingInput = $state(false);
	let triggerEvent = $state("field");
	let triggerField = $state("");
	let triggerCustom = $state(false);
	let triggerKey = $state("");
	let triggerConfig = $state<Record<string, AutomationValue>>({});
	let guardEnabled = $state(false);
	let guardPredicate = $state<AutomationPredicate>({ op: "always" });
	let steps = $state<FlowStep[]>([]);
	let exposeUi = $state(true);
	let exposeAgent = $state(true);
	let deleteOpen = $state(false);
	let saving = $state(false);

	const inputTypeDef = $derived(types.find((type) => type.key === inputType));

	$effect(() => {
		const identity = `${flow.id}:${flow.key}`;
		if (initializedFlow === identity) return;
		initializedFlow = identity;
		label = flow.label;
		description = flow.description ?? "";
		enabled = flow.enabled ?? true;
		kind = flowKind(flow);
		const inputs = Object.entries(flow.input ?? {});
		const [name, definition] = inputs[0] ?? [];
		inputEditable = inputs.length <= 1 && (!definition || ("record" in definition && definition.required !== false));
		const triggerType = types.find((type) => flow.trigger?.key.startsWith(`${type.key}.`))?.key;
		inputName = name ?? triggerType ?? types[0]?.key ?? "record";
		inputType = definition && "record" in definition ? definition.record : inputName;
		const parsedTrigger = parseTrigger(flow.trigger?.key ?? "", inputType);
		triggerCustom = Boolean(flow.trigger && !parsedTrigger);
		preserveMissingInput = inputs.length === 0 && triggerCustom;
		triggerKey = flow.trigger?.key ?? "";
		triggerConfig = cloneData(flow.trigger?.config ?? {});
		if (parsedTrigger) {
			triggerEvent = parsedTrigger.event;
			triggerField = parsedTrigger.field ?? "";
		}
		const entryGate = extractEntryGate(flow.steps);
		guardEnabled = Boolean(entryGate);
		guardPredicate = cloneData(entryGate?.predicate ?? simplePredicate(inputName, inputType));
		steps = cloneData(entryGate?.steps ?? flow.steps);
		exposeUi = flow.expose?.includes("ui") ?? kind === "button";
		exposeAgent = flow.expose?.includes("agent") ?? true;
	});

	const compiledSteps = $derived.by((): FlowStep[] => {
		const actions = cloneData(steps);
		return guardEnabled ? [{ gate: { predicate: cloneData(guardPredicate), pass: actions } }] : actions;
	});
	const compiledTrigger = $derived.by(() => {
		if (kind !== "rule") return undefined;
		if (triggerCustom) return triggerKey ? { key: triggerKey, ...(Object.keys(triggerConfig).length ? { config: triggerConfig } : {}) } : undefined;
		const key = standardTriggerKey();
		return key ? { key } : undefined;
	});
	const compiledExpose = $derived.by((): Exposure[] | undefined => {
		const expose: Exposure[] = [
			...(kind === "button" && exposeUi ? (["ui"] as const) : []),
			...(exposeAgent ? (["agent"] as const) : []),
		];
		return expose.length ? expose : undefined;
	});
	const draft = $derived({
		...flow,
		label,
		description: description || undefined,
		enabled,
		input: preserveMissingInput
			? flow.input
			: inputEditable && inputType
				? { [inputName || inputType]: { record: inputType } }
				: flow.input,
		trigger: compiledTrigger,
		expose: compiledExpose,
		steps: compiledSteps,
	} as FlowDef);
	const compatibility = $derived(checkAutomationCompatibility(draft, BROWSER_LOCAL_AUTOMATION_PROFILE));
	const dirty = $derived(stableStringify(draft) !== stableStringify(flow));

	function stableStringify(value: unknown): string {
		return JSON.stringify(value, (_key, item: unknown) =>
			item && typeof item === "object" && !Array.isArray(item)
				? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
				: item,
		);
	}

	function simplePredicate(name: string, typeKey: string): AutomationPredicate {
		const type = types.find((item) => item.key === typeKey);
		return { op: "context.equals", path: `vars.${name || typeKey}.${type?.fields[0]?.key ?? "id"}`, value: "" };
	}
	function extractEntryGate(source: FlowStep[]): { predicate: AutomationPredicate; steps: FlowStep[] } | undefined {
		const first = source[0];
		if (source.length !== 1 || !first || !("gate" in first) || first.id || first.gate.fail !== undefined) return undefined;
		return { predicate: first.gate.predicate, steps: first.gate.pass ?? [] };
	}
	function parseTrigger(key: string, typeKey: string): { event: string; field?: string } | undefined {
		if (!key) return undefined;
		if (key === `${typeKey}.created`) return { event: "created" };
		if (key === `${typeKey}.changed`) return { event: "changed" };
		if (key === `${typeKey}.deleted`) return { event: "deleted" };
		const match = new RegExp(`^${escapeRegex(typeKey)}\\.([^.]+)\\.changed$`).exec(key);
		return match ? { event: "field", field: match[1] } : undefined;
	}
	function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
	function standardTriggerKey(): string | undefined {
		if (!inputType) return undefined;
		if (triggerEvent === "created") return `${inputType}.created`;
		if (triggerEvent === "deleted") return `${inputType}.deleted`;
		if (triggerEvent === "field") return triggerField ? `${inputType}.${triggerField}.changed` : undefined;
		return `${inputType}.changed`;
	}
	function setInputType(next: string) {
		const previousName = inputName;
		preserveMissingInput = false;
		inputType = next;
		inputName = next;
		guardPredicate = replaceBindingRoot(guardPredicate, previousName, next);
		steps = replaceVariableRoot(steps, previousName, next);
	}
	function replaceVariableRoot<T>(value: T, previous: string, next: string): T {
		if (Array.isArray(value)) return value.map((item) => replaceVariableRoot(item, previous, next)) as T;
		if (!value || typeof value !== "object") return value;
		const source = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(source).map(([key, item]) => {
				if ((key === "$ref" || key === "path") && typeof item === "string" && item.startsWith(`vars.${previous}.`)) {
					return [key, `vars.${next}.${item.split(".").slice(2).join(".")}`];
				}
				return [key, replaceVariableRoot(item, previous, next)];
			}),
		) as T;
	}
	function replaceBindingRoot(predicate: AutomationPredicate, previous: string, next: string): AutomationPredicate {
		const raw = predicate as Record<string, unknown>;
		if (Array.isArray(raw.all)) return { all: (raw.all as AutomationPredicate[]).map((item) => replaceBindingRoot(item, previous, next)) };
		if (Array.isArray(raw.any)) return { any: (raw.any as AutomationPredicate[]).map((item) => replaceBindingRoot(item, previous, next)) };
		if (raw.not && typeof raw.not === "object") return { not: replaceBindingRoot(raw.not as AutomationPredicate, previous, next) };
		const path = typeof raw.path === "string" ? raw.path : "";
		return path.startsWith(`vars.${previous}.`)
			? { ...predicate, path: `vars.${next}.${path.split(".").slice(2).join(".")}` }
			: predicate;
	}
	async function save() {
		if (saving) return;
		saving = true;
		try {
			await runtime().upsertFlow(draft);
			toast.success("Saved");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not save workflow");
		} finally {
			saving = false;
		}
	}
	async function remove() {
		await runtime().deleteFlow(flow.key);
		toast.success("Deleted");
		await goto("/build/flows");
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={label || flow.label} description={flowSummary(draft, spec)} />

	<Card.Root size="sm" class="sticky top-3 z-10 mx-auto w-full max-w-4xl shadow-sm">
		<Card.Content class="flex items-center justify-between gap-3 py-2">
			<p class="text-xs text-muted-foreground">{dirty ? "Unsaved workflow changes" : "Workflow is up to date"}</p>
			<div class="flex items-center gap-2">
				<Button size="sm" variant="ghost" onclick={() => (deleteOpen = true)}>Delete</Button>
				<Button size="sm" onclick={save} disabled={!dirty || saving}>{#if saving}<Spinner data-icon="inline-start" />{/if} Save changes</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="mx-auto flex w-full max-w-4xl flex-col gap-5 sm:gap-6">
		<div class="relative flex flex-col gap-5 sm:gap-6">
			<div class="absolute bottom-0 left-5 top-10 hidden w-px bg-border sm:block"></div>

			<section class="grid min-w-0 gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-4">
				<div class="relative hidden size-10 items-center justify-center rounded-full border bg-background text-sm font-semibold shadow-xs sm:flex">1</div>
			<Card.Root>
				<Card.Header class="gap-0">
					<Card.Title>When</Card.Title>
					<Card.Description>{kind === "button" ? "Configure a workflow that runs on demand." : "Choose the trigger that starts this workflow."}</Card.Description>
				</Card.Header>
				<Card.Content>
					<Field.Group class="grid gap-4 md:grid-cols-2">
						<Field.Field class="md:col-span-2">
							<ToggleGroup.Root type="single" bind:value={kind} variant="outline" size="sm" spacing={1}>
								<ToggleGroup.Item value="rule"><ZapIcon data-icon="inline-start" /> Something happens</ToggleGroup.Item>
								<ToggleGroup.Item value="button"><MousePointerClickIcon data-icon="inline-start" /> Run manually</ToggleGroup.Item>
							</ToggleGroup.Root>
							<Field.Description>{kind === "button" ? "Started from a record button, agent, or API." : "Started by an event, schedule, webhook, or other trigger."}</Field.Description>
						</Field.Field>
						<Field.Field><Field.Label>Name</Field.Label><Input bind:value={label} placeholder={kind === "button" ? "Mark invoice paid" : "Record paid date"} /></Field.Field>
						<Field.Field><Field.Label>Description</Field.Label><Input bind:value={description} placeholder="What this workflow does" /></Field.Field>
						<Field.Field>
							<Field.Label>{kind === "button" ? "Show on" : "Watch"}</Field.Label>
							<AppSelect value={inputType} onValueChange={setInputType} options={types.map((type) => ({ value: type.key, label: type.label }))} disabled={!inputEditable} />
							{#if !inputEditable}<Field.Description>Structured inputs are preserved from the spec.</Field.Description>{/if}
						</Field.Field>
						{#if kind === "rule"}
							{#if triggerCustom}
								<Field.Field><Field.Label>Trigger key</Field.Label><Input bind:value={triggerKey} /><Field.Description>Portable registry key, such as schedule.cron or webhook.received.</Field.Description></Field.Field>
								<Field.Field><Field.Label>Trigger configuration</Field.Label><AutomationValueMapEditor values={triggerConfig} onValuesChange={(config) => (triggerConfig = config)} keyPlaceholder="Setting" /></Field.Field>
							{:else}
								<Field.Field>
									<Field.Label>Event</Field.Label>
									<AppSelect bind:value={triggerEvent} options={[{ value: "created", label: "A record is added" }, { value: "changed", label: "A record changes" }, { value: "field", label: "A field changes" }, { value: "deleted", label: "A record is deleted" }]} />
								</Field.Field>
								{#if triggerEvent === "field"}
									<Field.Field><Field.Label>Field</Field.Label><AppSelect bind:value={triggerField} options={(inputTypeDef?.fields ?? []).map((field) => ({ value: field.key, label: field.label }))} placeholder="Select a field" /></Field.Field>
								{/if}
							{/if}
						{/if}
					</Field.Group>
				</Card.Content>
				<Card.Footer>
					<Field.Group class="grid w-full gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
						<Field.Field orientation="horizontal"><Switch bind:checked={enabled} /><div><Field.Label class="font-normal">Enabled</Field.Label><Field.Description>Allow this workflow to run.</Field.Description></div></Field.Field>
						{#if kind === "button"}
							<Field.Field orientation="horizontal"><Switch bind:checked={exposeUi} /><div><Field.Label class="font-normal">Record button</Field.Label><Field.Description>Show when a record is open.</Field.Description></div></Field.Field>
						{/if}
						<Field.Field orientation="horizontal"><Switch bind:checked={exposeAgent} /><div><Field.Label class="font-normal">Agent tool</Field.Label><Field.Description>Allow agent invocation.</Field.Description></div></Field.Field>
					</Field.Group>
				</Card.Footer>
			</Card.Root>
			</section>

			<section class="grid min-w-0 gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-4">
				<div class="relative hidden size-10 items-center justify-center rounded-full border bg-background text-sm font-semibold shadow-xs sm:flex">2</div>
			<Card.Root>
				<Card.Header class="gap-0">
					<div class="flex items-center justify-between gap-3"><div class="flex flex-col gap-0"><Card.Title>If</Card.Title><Card.Description>Optionally limit when this workflow continues.</Card.Description></div><Switch bind:checked={guardEnabled} aria-label="Use entry condition" /></div>
				</Card.Header>
				{#if guardEnabled}
					<Card.Content><AutomationPredicateEditor predicate={guardPredicate} onPredicateChange={(next) => (guardPredicate = next)} {inputName} type={inputTypeDef} /></Card.Content>
				{:else}
					<Card.Content><p class="text-sm text-muted-foreground">No conditions. Every matching event continues to the actions below.</p></Card.Content>
				{/if}
			</Card.Root>
			</section>

			<section class="grid min-w-0 gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-4">
				<div class="relative hidden size-10 items-center justify-center rounded-full border bg-background text-sm font-semibold shadow-xs sm:flex">3</div>
			<Card.Root>
				<Card.Header class="gap-0"><Card.Title>Then</Card.Title><Card.Description>Actions run from top to bottom. Conditions can branch into more steps.</Card.Description></Card.Header>
				<Card.Content><AutomationStepList {steps} onStepsChange={(next) => (steps = next)} {inputName} {inputType} {types} flows={flows.filter((item) => item.key !== flow.key)} {spec} /></Card.Content>
				</Card.Root>
			</section>
		</div>

		{#if compatibility.diagnostics.length}
			<div class="sm:pl-14">
				<Alert.Root>
					<CircleAlertIcon />
					<Alert.Title>Runtime compatibility</Alert.Title>
					<Alert.Description>
						<p>This workflow is portable, but the current browser host has limits.</p>
						{#each compatibility.diagnostics as item (item.capability)}
							<div class="flex items-start gap-2 text-xs"><Badge variant="outline">{labelFromKey(item.support)}</Badge><p class="pt-0.5 text-muted-foreground">{item.message}</p></div>
						{/each}
					</Alert.Description>
				</Alert.Root>
			</div>
		{/if}
	</div>
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header><AlertDialog.Title>Delete {flow.label}?</AlertDialog.Title><AlertDialog.Description>The button or automation is removed. Records stay.</AlertDialog.Description></AlertDialog.Header>
		<AlertDialog.Footer><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action></AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
