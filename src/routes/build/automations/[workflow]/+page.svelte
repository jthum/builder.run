<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import WorkflowEditor from "$lib/components/workflow-editor.svelte";

	const workflow = $derived(session.snapshot?.spec.workflows.find((item) => item.key === page.params.workflow));
</script>

{#if workflow}
	<WorkflowEditor {workflow} />
{:else}
	<p class="text-muted-foreground">This workflow isn't in the app.</p>
{/if}
