<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import WorkflowEditor from "$lib/components/workflow-editor.svelte";

	const canonicalRule = $derived(
		canonicalStudio.context?.rules.find((item) => item.key === page.params.workflow),
	);
	const workflow = $derived(
		canonicalStudio.context
			? canonicalRule
			: session.resolvedSpec?.workflows.find((item) => item.key === page.params.workflow),
	);
</script>

{#if workflow}
	<WorkflowEditor {workflow} canonical={Boolean(canonicalRule)} />
{:else}
	<p class="text-muted-foreground">This workflow isn't in the app.</p>
{/if}
