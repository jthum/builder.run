<script lang="ts">
	import * as Field from "$lib/components/ui/field/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import type { FormDef } from "$lib/runtime/model.ts";

	let {
		value = $bindable(),
		disableRecordForms = false,
	}: {
		value: FormDef["mode"];
		disableRecordForms?: boolean;
	} = $props();
</script>

<Field.FieldSet>
	<Field.FieldLegend>What is this form for?</Field.FieldLegend>
	<ToggleGroup.Root
		type="single"
		{value}
		onValueChange={(next) => next && (value = next as FormDef["mode"])}
		variant="card"
		size="card"
		spacing={2}
		class="grid w-full grid-cols-1 items-stretch md:grid-cols-3"
	>
		<ToggleGroup.Item value="create" disabled={disableRecordForms} class="h-full">
			<span class="mt-0.5 flex size-4 shrink-0 rounded-full border group-data-[state=on]/toggle:border-primary">
				<span class="m-auto size-2 rounded-full bg-primary opacity-0 group-data-[state=on]/toggle:opacity-100"></span>
			</span>
			<span class="flex min-w-0 flex-col gap-0.5">
				<span>Add records</span>
				<span class="text-xs font-normal text-muted-foreground">Shown when someone creates a new record.</span>
			</span>
		</ToggleGroup.Item>
		<ToggleGroup.Item value="edit" disabled={disableRecordForms} class="h-full">
			<span class="mt-0.5 flex size-4 shrink-0 rounded-full border group-data-[state=on]/toggle:border-primary">
				<span class="m-auto size-2 rounded-full bg-primary opacity-0 group-data-[state=on]/toggle:opacity-100"></span>
			</span>
			<span class="flex min-w-0 flex-col gap-0.5">
				<span>Edit records</span>
				<span class="text-xs font-normal text-muted-foreground">Shown when someone changes an existing record.</span>
			</span>
		</ToggleGroup.Item>
		<ToggleGroup.Item value="standalone" class="h-full">
			<span class="mt-0.5 flex size-4 shrink-0 rounded-full border group-data-[state=on]/toggle:border-primary">
				<span class="m-auto size-2 rounded-full bg-primary opacity-0 group-data-[state=on]/toggle:opacity-100"></span>
			</span>
			<span class="flex min-w-0 flex-col gap-0.5">
				<span>Custom form</span>
				<span class="text-xs font-normal text-muted-foreground">Collect information and use workflows to take action.</span>
			</span>
		</ToggleGroup.Item>
	</ToggleGroup.Root>
</Field.FieldSet>
