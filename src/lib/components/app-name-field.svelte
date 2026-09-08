<script lang="ts">
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";

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
