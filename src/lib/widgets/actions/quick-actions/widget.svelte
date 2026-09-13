<script lang="ts">
	import { runtime } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import { toast } from "svelte-sonner";
	let { values, spec }: WidgetRendererProps = $props();
	const actions = $derived([
		{ workflow: String(values.first_workflow ?? ""), label: String(values.first_label ?? "") },
		{ workflow: String(values.second_workflow ?? ""), label: String(values.second_label ?? "") },
		{ workflow: String(values.third_workflow ?? ""), label: String(values.third_label ?? "") },
	].filter((action) => action.workflow).map((action) => ({ ...action, label: action.label || spec?.workflows.find((workflow) => workflow.key === action.workflow)?.label || "Run workflow" })));
	async function run(workflow: string, label: string) {
		await runtime().invoke(workflow, {});
		toast.success(label);
	}
</script>

<Card.Root class="h-full">
	<Card.Header class="gap-0"><Card.Title>{String(values.title || "Quick actions")}</Card.Title>{#if values.description}<Card.Description>{String(values.description)}</Card.Description>{/if}</Card.Header>
	<Card.Content class="grid gap-2 sm:grid-cols-2">
		{#each actions as action, index (action.workflow)}
			<Button variant={index === 0 ? "default" : "outline"} class="h-auto justify-between py-3" onclick={() => run(action.workflow, action.label)}>{action.label}<ArrowRightIcon data-icon="inline-end" /></Button>
		{/each}
	</Card.Content>
</Card.Root>
