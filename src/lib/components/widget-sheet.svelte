<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import {
		fieldsForView,
		fieldsMatching,
		widgetByKey,
		type WidgetFieldKind,
	} from "$lib/runtime/widgets.ts";

	let {
		open = $bindable(false),
		block = null,
		onSave,
	}: {
		open?: boolean;
		block?: PageBlock | null;
		onSave: (values: Record<string, unknown>) => void;
	} = $props();

	const spec = $derived(session.snapshot?.spec);
	const def = $derived(block?.kind === "widget" ? widgetByKey(block.widget) : undefined);
	let values = $state<Record<string, unknown>>({});

	$effect(() => {
		if (!open) return;
		void block;
		values = {
			...(block?.kind === "widget" ? (JSON.parse(JSON.stringify(block.values ?? {})) as Record<string, unknown>) : {}),
		};
	});

	const viewOptions = $derived(
		(spec?.views ?? []).map((view) => ({ value: view.key, label: view.label })),
	);
	const formOptions = $derived(
		(spec?.forms ?? []).map((form) => ({ value: form.key, label: form.label })),
	);
	const flowOptions = $derived(
		(spec?.flows ?? [])
			.filter((flow) => flow.expose?.includes("ui") && !flow.trigger)
			.map((flow) => ({ value: flow.key, label: flow.label })),
	);

	const showCaption = $derived(Boolean(def?.inputs.some((input) => input.type === "view")));

	function fieldOptions(of?: WidgetFieldKind) {
		const viewKey = String(values.view ?? "");
		const fields = spec ? fieldsForView(spec, viewKey) : [];
		return fieldsMatching(fields, of).map((field) => ({
			value: field.key,
			label: field.label,
		}));
	}

	function submit(event: Event) {
		event.preventDefault();
		onSave(values);
		open = false;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content class="sm:max-w-md" side="right">
		<form class="flex h-full min-h-0 flex-col" onsubmit={submit}>
			<Sheet.Header>
				<Sheet.Title>{def?.label ?? "Widget"}</Sheet.Title>
				<Sheet.Description>
					{def?.description ?? "Update the values this widget renders."}
				</Sheet.Description>
			</Sheet.Header>
			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6">
				<Field.Group>
					{#if showCaption}
						<Field.Field>
							<Field.Label>Title</Field.Label>
							<Input
								bind:value={values.title as string}
								placeholder="Leave blank to use the view name"
								data-testid="widget-title"
							/>
							<Field.Description>Shown on the widget. Blank uses the view name.</Field.Description>
						</Field.Field>
					{/if}
					{#each def?.inputs ?? [] as input (input.key)}
						{#if input.type === "boolean"}
							<Field.Field orientation="horizontal">
								<Switch
									checked={Boolean(values[input.key])}
									onCheckedChange={(checked) => (values[input.key] = checked)}
								/>
								<Field.Label>{input.label}</Field.Label>
							</Field.Field>
						{:else}
							<Field.Field>
								<Field.Label>{input.label}</Field.Label>
								{#if input.type === "textarea"}
									<Textarea bind:value={values[input.key] as string} />
								{:else if input.type === "view"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={viewOptions}
										placeholder="Select a view"
									/>
								{:else if input.type === "form"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={formOptions}
										placeholder="Select a form"
									/>
								{:else if input.type === "flow"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={flowOptions}
										placeholder="Select a rule"
									/>
								{:else if input.type === "field"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={fieldOptions(input.of)}
										placeholder="Select a field"
									/>
								{:else if input.type === "select"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={input.options ?? []}
										placeholder="Select"
									/>
								{:else}
									<Input bind:value={values[input.key] as string} data-testid="widget-field" />
								{/if}
							</Field.Field>
						{/if}
					{/each}
				</Field.Group>
			</div>
			<Sheet.Footer class="flex-row justify-end">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Save</Button>
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>
