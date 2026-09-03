<script lang="ts">
	import AppSelect from "$lib/components/app-select.svelte";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { FieldDef } from "$lib/runtime/model.ts";

	let {
		fields,
		values = $bindable(),
		idPrefix = "expose",
	}: {
		fields: FieldDef[];
		values: Record<string, string>;
		idPrefix?: string;
	} = $props();
</script>

{#if fields.length}
	<div class="flex flex-wrap items-end gap-3">
		{#each fields as field (field.key)}
			<Field.Field class="min-w-40 max-w-56">
				<Field.Label for="{idPrefix}-{field.key}">{field.label}</Field.Label>
				{#if field.type === "enum"}
					<AppSelect
						bind:value={values[field.key]}
						options={[
							{ value: "", label: "Any" },
							...(field.values ?? []).map((value) => ({
								value,
								label: labelFromKey(value),
							})),
						]}
					/>
				{:else if field.type === "boolean"}
					<AppSelect
						bind:value={values[field.key]}
						options={[
							{ value: "", label: "Any" },
							{ value: "true", label: "Yes" },
							{ value: "false", label: "No" },
						]}
					/>
				{:else}
					<Input id="{idPrefix}-{field.key}" bind:value={values[field.key]} placeholder="Any" />
				{/if}
			</Field.Field>
		{/each}
	</div>
{/if}
