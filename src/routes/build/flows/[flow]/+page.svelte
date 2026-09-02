<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import FlowEditor from "$lib/components/flow-editor.svelte";

	const flow = $derived(session.snapshot?.spec.flows.find((item) => item.key === page.params.flow));
</script>

{#if flow}
	<FlowEditor {flow} />
{:else}
	<p class="text-muted-foreground">This rule isn't in the app.</p>
{/if}
