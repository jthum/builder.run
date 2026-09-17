<script lang="ts">
	import AppSelect from "$lib/components/app-select.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import type { AppSpec, PageBlock } from "$lib/runtime/model.ts";
	import { widgetByKey, widgetInputOptions, widgetInputs } from "$lib/runtime/widgets.ts";

	let {
		open = $bindable(false),
		block = null,
		spec,
		onSave,
	}: {
		open?: boolean;
		block?: PageBlock | null;
		spec?: AppSpec;
		onSave: (values: Record<string, unknown>) => void;
	} = $props();

	const def = $derived(block?.kind === "widget" ? widgetByKey(block.widget) : undefined);
	let values = $state<Record<string, unknown>>({});

	$effect(() => {
		if (!open) return;
		void block;
		values = {
			...(block?.kind === "widget" ? (JSON.parse(JSON.stringify(block.values ?? {})) as Record<string, unknown>) : {}),
		};
	});

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
					{#each def ? widgetInputs(def) : [] as input (input.key)}
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
								{:else if input.type === "number"}
									<Input
										type="number"
										value={Number(values[input.key] ?? input.default ?? 0)}
										oninput={(event) => (values[input.key] = event.currentTarget.valueAsNumber)}
									/>
								{:else if input.type === "view"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={spec ? widgetInputOptions(spec, input, values) : []}
										placeholder="Select a view"
									/>
								{:else if input.type === "form"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={spec ? widgetInputOptions(spec, input, values) : []}
										placeholder="Select a form"
									/>
								{:else if input.type === "workflow"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={spec ? widgetInputOptions(spec, input, values) : []}
										placeholder="Select a rule"
									/>
								{:else if input.type === "field"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={spec ? widgetInputOptions(spec, input, values) : []}
										placeholder="Select a field"
									/>
								{:else if input.type === "select"}
									<AppSelect
										bind:value={values[input.key] as string}
										options={spec ? widgetInputOptions(spec, input, values) : []}
										placeholder="Select"
									/>
								{:else}
									<Input
										bind:value={values[input.key] as string}
										data-testid={input.key === "title" ? "widget-title" : "widget-field"}
									/>
								{/if}
								{#if input.description}
									<Field.Description>{input.description}</Field.Description>
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
