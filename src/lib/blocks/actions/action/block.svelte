<script lang="ts">
	import { runWorkflow } from "$lib/app/workflow-launch.ts";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config }: BlockProps = $props();
	async function run() {
		const workflow = String(config.workflow ?? "");
		if (!workflow) return;
		await runWorkflow(workflow, {}, String(config.label || "Done"));
	}
</script>

<Button onclick={run}>{String(config.label || "Run")}</Button>
