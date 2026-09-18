<script lang="ts">
	import {
		fieldValueSemantic,
		isStatusPath,
		semanticDotClass,
		statusDotClass,
	} from "$lib/app/labels.ts";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as DropdownMenu from "@jthum/framework/svelte/ui/dropdown-menu";
	import * as InputGroup from "@jthum/framework/svelte/ui/input-group";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { FieldDraft } from "$lib/blocks/presentation.ts";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";

	const anyFilter = "__any__";

	let {
		fields,
		values = $bindable(),
		idPrefix = "expose",
		mode = "panel",
	}: {
		fields: FieldDraft[];
		values: Record<string, string>;
		idPrefix?: string;
		mode?: "panel" | "active";
	} = $props();

	function choices(field: FieldDraft): Array<{ value: string; label: string }> | null {
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

	function inputType(field: FieldDraft): "date" | "number" | "search" {
		if (field.type === "date") return "date";
		if (field.type === "number") return "number";
		return "search";
	}

	function dotClass(field: FieldDraft, value: string): string | undefined {
		const semantic = fieldValueSemantic(field, value);
		if (semantic) return semanticDotClass(semantic);
		return isStatusPath(field.key) ? statusDotClass(value) : undefined;
	}
</script>

{#if fields.length}
	{#if mode === "active"}
		{#each fields.filter((field) => Boolean(values[field.key])) as field (field.key)}
			{@const options = choices(field)}
			{@const current = values[field.key] ?? ""}
			{@const currentDot = dotClass(field, current)}
			<Badge variant="outline" class="h-8 gap-1.5 bg-background pr-1 pl-2.5 text-sm font-normal">
				{#if currentDot}<span class="size-1.5 rounded-full {currentDot}"></span>{/if}
				<span class="text-muted-foreground">{field.label}:</span>
				{options?.find((option) => option.value === current)?.label ?? labelFromKey(current)}
				<Button
					variant="ghost"
					size="icon-xs"
					onclick={() => setValue(field.key, "")}
					aria-label={`Clear ${field.label.toLowerCase()} filter`}
				>
					<XIcon />
				</Button>
			</Badge>
		{/each}
	{:else}
		<div class="flex flex-col gap-3">
			{#each fields as field (field.key)}
				{@const options = choices(field)}
				{@const current = values[field.key] ?? ""}
				{@const currentDot = current ? dotClass(field, current) : undefined}
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-medium text-muted-foreground">{field.label}</span>
					{#if options}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" size="sm" class="w-full justify-between" {...props}>
										<span class="flex min-w-0 items-center gap-2">
											{#if currentDot}<span class="size-1.5 rounded-full {currentDot}"></span>{/if}
											{current
												? options.find((option) => option.value === current)?.label ?? labelFromKey(current)
												: `Any ${field.label.toLowerCase()}`}
										</span>
										<ChevronDownIcon data-icon="inline-end" class="text-muted-foreground" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-auto min-w-52">
								<DropdownMenu.RadioGroup
									value={current || anyFilter}
									onValueChange={(value) => setValue(field.key, value === anyFilter ? "" : value)}
								>
									<DropdownMenu.RadioItem value={anyFilter}>Any {field.label.toLowerCase()}</DropdownMenu.RadioItem>
									{#each options as option (option.value)}
										{@const dot = dotClass(field, option.value)}
										<DropdownMenu.RadioItem value={option.value}>
											{#if dot}<span class="size-1.5 rounded-full {dot}"></span>{/if}
											{option.label}
										</DropdownMenu.RadioItem>
									{/each}
								</DropdownMenu.RadioGroup>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{:else}
						<InputGroup.Root class="h-8 w-full bg-background">
							<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
							<InputGroup.Input
								id="{idPrefix}-{field.key}"
								type={inputType(field)}
								value={current}
								oninput={(event) => setValue(field.key, event.currentTarget.value)}
								placeholder={`Any ${field.label.toLowerCase()}`}
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
				</div>
			{/each}
		</div>
	{/if}
{/if}
