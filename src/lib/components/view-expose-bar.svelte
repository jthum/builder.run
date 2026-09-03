<script lang="ts">
	import { isStatusPath, statusDotClass } from "$lib/app/labels.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { FieldDef } from "$lib/runtime/model.ts";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ListFilterIcon from "@lucide/svelte/icons/list-filter";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";

	const anyFilter = "__any__";

	let {
		fields,
		values = $bindable(),
		idPrefix = "expose",
	}: {
		fields: FieldDef[];
		values: Record<string, string>;
		idPrefix?: string;
	} = $props();

	const hasValues = $derived(fields.some((field) => Boolean(values[field.key])));

	function choices(field: FieldDef): Array<{ value: string; label: string }> | null {
		if (field.type === "enum") {
			return (field.values ?? []).map((value) => ({ value, label: labelFromKey(value) }));
		}
		if (field.type === "boolean") {
			return [
				{ value: "true", label: "Yes" },
				{ value: "false", label: "No" },
			];
		}
		return null;
	}

	function setValue(field: string, value: string) {
		values = { ...values, [field]: value };
	}

	function clear() {
		values = Object.fromEntries(fields.map((field) => [field.key, ""]));
	}

	function inputType(field: FieldDef): "date" | "number" | "search" {
		if (field.type === "date") return "date";
		if (field.type === "number") return "number";
		return "search";
	}
</script>

{#if fields.length}
	<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
		{#each fields as field (field.key)}
			{@const options = choices(field)}
			{@const current = values[field.key] ?? ""}
			{#if options}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								variant={current ? "secondary" : "outline"}
								size="sm"
								class="h-8"
								{...props}
							>
								{#if isStatusPath(field.key) && current}
									<span class="size-1.5 rounded-full {statusDotClass(current)}"></span>
								{:else}
									<ListFilterIcon data-icon="inline-start" class="text-muted-foreground" />
								{/if}
								{field.label}{current ? `: ${options.find((option) => option.value === current)?.label ?? labelFromKey(current)}` : ""}
								<ChevronDownIcon data-icon="inline-end" class="text-muted-foreground" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-auto min-w-52">
						<DropdownMenu.Label>Filter by {field.label.toLowerCase()}</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.RadioGroup
							value={current || anyFilter}
							onValueChange={(value) => setValue(field.key, value === anyFilter ? "" : value)}
						>
							<DropdownMenu.RadioItem value={anyFilter}>Any {field.label.toLowerCase()}</DropdownMenu.RadioItem>
							{#each options as option (option.value)}
								<DropdownMenu.RadioItem value={option.value}>
									{#if isStatusPath(field.key)}
										<span class="size-1.5 rounded-full {statusDotClass(option.value)}"></span>
									{/if}
									{option.label}
								</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<InputGroup.Root class="h-8 min-w-40 max-w-56 flex-1 bg-background sm:flex-none">
					<InputGroup.Addon>
						<SearchIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						id="{idPrefix}-{field.key}"
						type={inputType(field)}
						value={current}
						oninput={(event) => setValue(field.key, event.currentTarget.value)}
						placeholder={field.label}
						aria-label={`Filter by ${field.label.toLowerCase()}`}
					/>
					{#if current}
						<InputGroup.Addon align="inline-end">
							<InputGroup.Button
								size="icon-xs"
								onclick={() => setValue(field.key, "")}
								aria-label={`Clear ${field.label.toLowerCase()} filter`}
							>
								<XIcon />
							</InputGroup.Button>
						</InputGroup.Addon>
					{/if}
				</InputGroup.Root>
			{/if}
		{/each}
		{#if hasValues}
			<Button variant="ghost" size="xs" onclick={clear}>
				<XIcon data-icon="inline-start" />
				Clear filters
			</Button>
		{/if}
	</div>
{/if}
