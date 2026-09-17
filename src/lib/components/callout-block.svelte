<script lang="ts">
	import * as Alert from "@jthum/framework/svelte/ui/alert";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import InfoIcon from "@lucide/svelte/icons/info";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	let {
		title = "Note",
		text = "",
		tone = "note",
	}: {
		title?: string;
		text?: string;
		tone?: string;
	} = $props();

	const kind = $derived(tone === "danger" ? "danger" : tone === "warning" ? "warning" : "note");
</script>

<Alert.Root variant={kind === "danger" ? "destructive" : "default"}>
	{#if kind === "danger"}
		<CircleAlertIcon />
	{:else if kind === "warning"}
		<TriangleAlertIcon />
	{:else}
		<InfoIcon />
	{/if}
	<Alert.Title>{title}</Alert.Title>
	{#if text}
		<Alert.Description>{text}</Alert.Description>
	{/if}
</Alert.Root>
