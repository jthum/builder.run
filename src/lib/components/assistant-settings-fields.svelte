<script lang="ts">
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";
	let {
		baseUrl = $bindable(""), model = $bindable(""), apiKey = $bindable(""), disabled = false,
	}: { baseUrl?: string; model?: string; apiKey?: string; disabled?: boolean } = $props();
	const id = $props.id();
</script>

<Field.Group>
	<Field.Field data-disabled={disabled}>
		<Field.Label for="{id}-endpoint">API endpoint</Field.Label>
		<Input id="{id}-endpoint" bind:value={baseUrl} type="url" placeholder="https://api.openai.com/v1" required {disabled} />
		<Field.Description>An OpenAI-compatible base URL. Requests are sent directly from this browser; the endpoint must allow browser access.</Field.Description>
	</Field.Field>
	<Field.Field data-disabled={disabled}>
		<Field.Label for="{id}-model">Model</Field.Label>
		<Input id="{id}-model" bind:value={model} placeholder="Model identifier" {disabled} />
	</Field.Field>
	<Field.Field data-disabled={disabled}>
		<Field.Label for="{id}-key">API key <span class="text-muted-foreground">(optional)</span></Field.Label>
		<Input id="{id}-key" bind:value={apiKey} type="password" placeholder="Required by most providers" autocomplete="off" {disabled} />
		<Field.Description>Stored in this browser, outside exported Specs. It is not encrypted and is accessible to scripts on this origin. Leave it blank for providers that do not require a key.</Field.Description>
	</Field.Field>
</Field.Group>
