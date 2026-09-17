<script lang="ts">
	import { page } from "$app/state";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import WorkflowEditor from "$lib/components/workflow-editor.svelte";

	const workflow = $derived(
		canonicalStudio.context?.rules.find((item) => item.key === page.params.workflow),
	);
</script>

{#if workflow}
	<WorkflowEditor {workflow} />
{:else}
	<p class="text-muted-foreground">This workflow isn't in the app.</p>
{/if}
