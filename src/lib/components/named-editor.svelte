<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { toast } from "svelte-sonner";

	let {
		title,
		description,
		items,
		hrefFor,
		onCreate,
	}: {
		title: string;
		description: string;
		items: Array<{ key: string; label: string; implicit?: boolean }>;
		hrefFor: (key: string) => string;
		onCreate: (input: { key: string; label: string; extra: string }) => Promise<void>;
	} = $props();

	let key = $state("");
	let label = $state("");
	let extra = $state("");
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{title}</h1>
		<p class="text-muted-foreground">{description}</p>
	</div>
	<div class="flex flex-col gap-2">
		{#each items as item (item.key)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href={hrefFor(item.key)}>
				<div class="font-medium">{item.label}</div>
				<div class="text-sm text-muted-foreground">{item.key}{item.implicit ? " · default" : ""}</div>
			</a>
		{/each}
	</div>
	<Card.Root>
		<Card.Header>
			<Card.Title>Create</Card.Title>
		</Card.Header>
		<Card.Content>
			<Field.Group>
				<Field.Field>
					<Field.Label>Key</Field.Label>
					<Input bind:value={key} placeholder="active_projects" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Label</Field.Label>
					<Input bind:value={label} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Details (JSON)</Field.Label>
					<Textarea class="font-mono text-xs" bind:value={extra} placeholder={`{ "source": "project" }`} />
				</Field.Field>
				<Button
					onclick={async () => {
						await onCreate({ key, label, extra });
						key = "";
						label = "";
						extra = "";
						toast.success("Saved");
					}}>Create</Button
				>
			</Field.Group>
		</Card.Content>
	</Card.Root>
</div>
