<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import * as Alert from "@jthum/framework/svelte/ui/alert";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Textarea } from "@jthum/framework/svelte/ui/textarea";
	import * as ToggleGroup from "@jthum/framework/svelte/ui/toggle-group";
	import { sharedTypeDependencies } from "$lib/runtime/serialize.ts";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { toast } from "svelte-sonner";

	let format = $state<"yaml" | "json">("yaml");
	let draft = $state("");
	const sharedDependencies = $derived(
		session.authoredSpec
			? sharedTypeDependencies(session.authoredSpec, [...session.sharedTypes])
			: [],
	);

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
		{#if sharedDependencies.length}
			<Alert.Root>
				<TriangleAlertIcon />
				<Alert.Title>Shared types are not included</Alert.Title>
				<Alert.Description>
					This app uses {sharedDependencies.map((type) => type.label).join(", ")} from the current
					space. Import this file into a space with compatible shared {sharedDependencies.length === 1
						? "type"
						: "types"}, or those references will not work.
				</Alert.Description>
			</Alert.Root>
		{/if}
		<ToggleGroup.Root type="single" bind:value={format} spacing={2}>
			<ToggleGroup.Item value="yaml">YAML</ToggleGroup.Item>
			<ToggleGroup.Item value="json">JSON</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Field.Field>
			<Field.Label class="sr-only">Spec</Field.Label>
			<Textarea class="min-h-96 font-mono text-xs" bind:value={draft} />
		</Field.Field>
	</Card.Content>
	<Card.Footer class="gap-2">
		<Button onclick={apply}>Apply</Button>
		<Button variant="outline" onclick={download}>Export</Button>
	</Card.Footer>
</Card.Root>
