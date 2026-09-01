<script lang="ts">
	import { runtime } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { toast } from "svelte-sonner";

	let format = $state<"yaml" | "json">("yaml");
	let draft = $state("");

	$effect(() => {
		draft = format === "json" ? runtime().exportJson() : runtime().exportYaml();
	});

	async function apply() {
		await runtime().replaceSpecText(draft);
		toast.success("Spec applied");
	}

	function download() {
		const blob = new Blob([draft], { type: format === "json" ? "application/json" : "text/yaml" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `app.${format === "json" ? "json" : "yaml"}`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Export</Card.Title>
		<Card.Description>Download or paste the app definition. This is how an agent moulds the app, and how you take it with you.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<ToggleGroup.Root type="single" bind:value={format} spacing={2}>
			<ToggleGroup.Item value="yaml">YAML</ToggleGroup.Item>
			<ToggleGroup.Item value="json">JSON</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Field.Field>
			<Field.Label class="sr-only">Spec</Field.Label>
			<Textarea class="min-h-96 font-mono text-xs" bind:value={draft} />
		</Field.Field>
		<div class="flex gap-2">
			<Button onclick={apply}>Apply</Button>
			<Button variant="outline" onclick={download}>Export</Button>
		</div>
	</Card.Content>
</Card.Root>
