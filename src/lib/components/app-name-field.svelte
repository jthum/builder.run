<script lang="ts">
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";

	let {
		value = $bindable(""),
		id = "app-name",
		autofocus = false,
	}: {
		value?: string;
		id?: string;
		autofocus?: boolean;
	} = $props();
</script>

<Field.Field>
	<Field.Label for={id}>App name</Field.Label>
	<Input {id} bind:value placeholder="Untitled app" {autofocus} />
</Field.Field>
