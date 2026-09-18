<script lang="ts">
	import { runWorkflow } from "$lib/app/workflow-launch.ts";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	let { config, spec }: BlockProps = $props();
	const actions = $derived([
		{ workflow: String(config.first_workflow ?? ""), label: String(config.first_label ?? "") },
		{ workflow: String(config.second_workflow ?? ""), label: String(config.second_label ?? "") },
		{ workflow: String(config.third_workflow ?? ""), label: String(config.third_label ?? "") },
	].filter((action) => action.workflow).map((action) => ({ ...action, label: action.label || spec?.workflows.find((workflow) => workflow.key === action.workflow)?.label || "Run workflow" })));
	async function run(workflow: string, label: string) {
		await runWorkflow(workflow, {}, label);
	}
</script>

<Card.Root class="h-full">
	<Card.Header class="gap-0"><Card.Title>{String(config.title || "Quick actions")}</Card.Title>{#if config.description}<Card.Description>{String(config.description)}</Card.Description>{/if}</Card.Header>
	<Card.Content class="grid gap-2 sm:grid-cols-2">
		{#each actions as action, index (action.workflow)}
			<Button variant={index === 0 ? "default" : "outline"} class="h-auto justify-between py-3" onclick={() => run(action.workflow, action.label)}>{action.label}<ArrowRightIcon data-icon="inline-end" /></Button>
		{/each}
	</Card.Content>
</Card.Root>
