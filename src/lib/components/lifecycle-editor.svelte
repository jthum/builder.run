<script lang="ts">
	import { runtime } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { labelFromKey, slugify } from "$lib/runtime/ids.ts";
	import type { TypeDef, TypeTransitionDef } from "$lib/runtime/model.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	let { type }: { type: TypeDef } = $props();

	type TransitionDraft = TypeTransitionDef & { localId: string };
	const enumFields = $derived(type.fields.filter((field) => field.type === "enum"));
	const fieldOptions = $derived(
		enumFields.map((field) => ({ value: field.key, label: field.label })),
	);
	let open = $state(false);
	let field = $state("");
	let initial = $state("");
	let terminal = $state<string[]>([]);
	let transitions = $state<TransitionDraft[]>([]);
	let pending = $state(false);
	const states = $derived(enumFields.find((item) => item.key === field)?.values ?? []);
	const stateOptions = $derived(states.map((state) => ({ value: state, label: labelFromKey(state) })));

	function edit() {
		field = type.lifecycle?.field ?? enumFields[0]?.key ?? "";
		const available = enumFields.find((item) => item.key === field)?.values ?? [];
		initial = type.lifecycle?.initial ?? available[0] ?? "";
		terminal = [...(type.lifecycle?.terminal ?? [])];
		transitions = (type.lifecycle?.transitions ?? []).map((transition, index) => ({
			...transition,
			from: [...transition.from],
			localId: `${transition.key}-${index}`,
		}));
		open = true;
	}

	function selectField(next: string) {
		field = next;
		const available = enumFields.find((item) => item.key === next)?.values ?? [];
		initial = available[0] ?? "";
		terminal = [];
		transitions = [];
	}

	function toggleTerminal(state: string, checked: boolean) {
		terminal = checked ? [...terminal, state] : terminal.filter((item) => item !== state);
		if (checked) {
			transitions = transitions.map((transition) => ({
				...transition,
				from: transition.from.filter((source) => source !== state),
			}));
		}
	}

	function addTransition() {
		const from = states.find((state) => !terminal.includes(state)) ?? states[0] ?? "";
		const to = states.find((state) => state !== from) ?? "";
		transitions = [
			...transitions,
			{ localId: crypto.randomUUID(), key: "", label: "", from: from ? [from] : [], to },
		];
	}

	function updateTransition(localId: string, patch: Partial<TransitionDraft>) {
		transitions = transitions.map((item) => (item.localId === localId ? { ...item, ...patch } : item));
	}

	function toggleSource(localId: string, state: string, checked: boolean) {
		const transition = transitions.find((item) => item.localId === localId);
		if (!transition) return;
		const from = checked
			? [...transition.from, state]
			: transition.from.filter((item) => item !== state);
		updateTransition(localId, { from });
	}

	async function save() {
		if (!field || !initial) return;
		pending = true;
		try {
			await runtime().upsertType({
				key: type.key,
				lifecycle: {
					field,
					initial,
					terminal,
					transitions: transitions.map(({ localId: _, ...transition }) => ({
						...transition,
						key: transition.key.trim() || slugify(transition.label),
						label: transition.label.trim(),
					})),
				},
			});
			open = false;
			toast.success("Lifecycle saved");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			pending = false;
		}
	}

	async function remove() {
		pending = true;
		try {
			await runtime().upsertType({ key: type.key, lifecycle: null });
			open = false;
			toast.success("Lifecycle removed");
		} finally {
			pending = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Lifecycle</Card.Title>
		<Card.Description>Control how records move through an enum field.</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if type.lifecycle}
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<span class="text-muted-foreground">{labelFromKey(type.lifecycle.field)}</span>
				<Badge variant="secondary">Starts {labelFromKey(type.lifecycle.initial)}</Badge>
				<Badge variant="secondary">{type.lifecycle.transitions.length} transitions</Badge>
				{#each type.lifecycle.terminal ?? [] as state (state)}
					<Badge variant="outline">Ends {labelFromKey(state)}</Badge>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				Choose an enum field, its starting state, and the transitions records may follow.
			</p>
		{/if}
	</Card.Content>
	<Card.Footer class="justify-end">
		<Button variant="outline" disabled={!enumFields.length} onclick={edit}>
			{type.lifecycle ? "Edit lifecycle" : "Configure lifecycle"}
		</Button>
	</Card.Footer>
</Card.Root>

<Sheet.Root bind:open>
	<Sheet.Content class="sm:max-w-xl" side="right">
		<Sheet.Header>
			<Sheet.Title>{type.lifecycle ? "Edit lifecycle" : "Configure lifecycle"}</Sheet.Title>
			<Sheet.Description>
				The enum choices are states. Named transitions are the only permitted state changes.
			</Sheet.Description>
		</Sheet.Header>
		<div class="flex flex-1 flex-col gap-6 overflow-y-auto px-6">
			<Field.Group>
				<Field.Field>
					<Field.Label>State field</Field.Label>
					<AppSelect value={field} options={fieldOptions} onValueChange={selectField} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Initial state</Field.Label>
					<AppSelect bind:value={initial} options={stateOptions} />
					<Field.Description>Every new record starts here.</Field.Description>
				</Field.Field>
				<Field.FieldSet>
					<Field.FieldLegend>Terminal states</Field.FieldLegend>
					<Field.Description>Records cannot leave these states.</Field.Description>
					<Field.Group class="grid grid-cols-2 gap-3">
						{#each states as state (state)}
							<Field.Field orientation="horizontal">
								<Checkbox
									checked={terminal.includes(state)}
									onCheckedChange={(checked) => toggleTerminal(state, checked === true)}
								/>
								<Field.Label>{labelFromKey(state)}</Field.Label>
							</Field.Field>
						{/each}
					</Field.Group>
				</Field.FieldSet>
			</Field.Group>

			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="font-medium">Transitions</h3>
					<p class="text-sm text-muted-foreground">A transition can start from one or several states.</p>
				</div>
				<Button size="sm" variant="outline" onclick={addTransition}>
					<PlusIcon data-icon="inline-start" />
					Add
				</Button>
			</div>

			<div class="flex flex-col gap-3">
				{#each transitions as transition, index (transition.localId)}
					<Card.Root>
						<Card.Header class="flex-row items-center justify-between">
							<Card.Title>Transition {index + 1}</Card.Title>
							<Button
								size="icon"
								variant="ghost"
								onclick={() =>
									(transitions = transitions.filter((item) => item.localId !== transition.localId))}
							>
								<TrashIcon />
								<span class="sr-only">Remove transition</span>
							</Button>
						</Card.Header>
						<Card.Content class="flex flex-col gap-4">
							<Field.Field>
									<Field.Label>Name</Field.Label>
									<Input
										value={transition.label}
										oninput={(event) =>
											updateTransition(transition.localId, {
												label: event.currentTarget.value,
												key: transition.key || slugify(event.currentTarget.value),
											})}
										placeholder="Submit"
									/>
							</Field.Field>
							<Field.FieldSet>
								<Field.FieldLegend>Available from</Field.FieldLegend>
								<Field.Group class="grid grid-cols-2 gap-3">
									{#each states.filter((state) => !terminal.includes(state) && state !== transition.to) as state (state)}
										<Field.Field orientation="horizontal">
											<Checkbox
												checked={transition.from.includes(state)}
												onCheckedChange={(checked) =>
													toggleSource(transition.localId, state, checked === true)}
											/>
											<Field.Label>{labelFromKey(state)}</Field.Label>
										</Field.Field>
									{/each}
								</Field.Group>
							</Field.FieldSet>
							<Field.Field>
								<Field.Label>Moves to</Field.Label>
								<AppSelect
									value={transition.to}
									options={stateOptions}
									onValueChange={(to) =>
									updateTransition(transition.localId, {
										to,
										from: transition.from.filter((source) => source !== to),
									})}
								/>
							</Field.Field>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		</div>
		<Sheet.Footer>
			{#if type.lifecycle}
				<Button variant="ghost" disabled={pending} onclick={remove}>Remove lifecycle</Button>
			{/if}
			<Button disabled={pending || !field || !initial} onclick={save}>Save lifecycle</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
