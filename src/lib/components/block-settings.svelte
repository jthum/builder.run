<script lang="ts">
	import AppSelect from "$lib/components/app-select.svelte";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";
	import * as Sheet from "@jthum/framework/svelte/ui/sheet";
	import { Switch } from "@jthum/framework/svelte/ui/switch";
	import { Textarea } from "@jthum/framework/svelte/ui/textarea";
	import type { AppSpec, PageLayoutNode } from "$lib/runtime/model.ts";
	import { blockByKey, blockInputOptions, blockInputs } from "$lib/runtime/blocks.ts";

	let {
		open = $bindable(false),
		node = null,
		spec,
		onSave,
	}: {
		open?: boolean;
		node?: PageLayoutNode | null;
		spec?: AppSpec;
		onSave: (config: Record<string, unknown>) => void;
	} = $props();

	const def = $derived(node?.kind === "block" ? blockByKey(node.block) : undefined);
	let config = $state<Record<string, unknown>>({});

	$effect(() => {
		if (!open) return;
		void node;
		config = {
			...(node?.kind === "block" ? (JSON.parse(JSON.stringify(node.config ?? {})) as Record<string, unknown>) : {}),
		};
	});

	function submit(event: Event) {
		event.preventDefault();
		onSave(config);
		open = false;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content class="sm:max-w-md" side="right">
		<form class="flex h-full min-h-0 flex-col" onsubmit={submit}>
			<Sheet.Header>
				<Sheet.Title>{def?.label ?? "Block"}</Sheet.Title>
				<Sheet.Description>
					{def?.description ?? "Configure this block."}
				</Sheet.Description>
			</Sheet.Header>
			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6">
				<Field.Group>
					{#each def ? blockInputs(def) : [] as input (input.key)}
						{#if input.type === "boolean"}
							<Field.Field orientation="horizontal">
								<Switch
									checked={Boolean(config[input.key])}
									onCheckedChange={(checked) => (config[input.key] = checked)}
								/>
								<Field.Label>{input.label}</Field.Label>
							</Field.Field>
						{:else}
							<Field.Field>
								<Field.Label>{input.label}</Field.Label>
								{#if input.type === "textarea"}
									<Textarea bind:value={config[input.key] as string} />
								{:else if input.type === "number"}
									<Input
										type="number"
										value={Number(config[input.key] ?? input.default ?? 0)}
										oninput={(event) => (config[input.key] = event.currentTarget.valueAsNumber)}
									/>
								{:else if input.type === "view"}
									<AppSelect
										bind:value={config[input.key] as string}
										options={spec ? blockInputOptions(spec, input, config) : []}
										placeholder="Select a view"
									/>
								{:else if input.type === "form"}
									<AppSelect
										bind:value={config[input.key] as string}
										options={spec ? blockInputOptions(spec, input, config) : []}
										placeholder="Select a form"
									/>
								{:else if input.type === "rule"}
									<AppSelect
										bind:value={config[input.key] as string}
										options={spec ? blockInputOptions(spec, input, config) : []}
										placeholder="Select a rule"
									/>
								{:else if input.type === "field"}
									<AppSelect
										bind:value={config[input.key] as string}
										options={spec ? blockInputOptions(spec, input, config) : []}
										placeholder="Select a field"
									/>
								{:else if input.type === "select"}
									<AppSelect
										bind:value={config[input.key] as string}
										options={spec ? blockInputOptions(spec, input, config) : []}
										placeholder="Select"
									/>
								{:else}
									<Input
										bind:value={config[input.key] as string}
										data-testid={input.key === "title" ? "block-title" : "block-field"}
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
