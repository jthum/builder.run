<script lang="ts">
	import { goto } from "$app/navigation";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import NameDialog from "@jthum/framework/svelte/studio/name-dialog";
	import { ruleSummary } from "@jthum/framework/svelte/studio/data";
	import type { NewRuleDraft } from "@jthum/framework/svelte/studio/data";
	import PageHeader from "@jthum/framework/svelte/studio/page-header";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { slugify } from "$lib/runtime/ids.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";

	const workflows = $derived(canonicalStudio.context?.rules ?? []);
	const types = $derived(canonicalStudio.context?.collections ?? []);
	const manualWorkflows = $derived(workflows.filter((workflow) => !workflow.trigger));
	const automaticWorkflows = $derived(workflows.filter((workflow) => workflow.trigger));

	let createKind = $state<"manual" | "automatic">("automatic");
	let open = $state(false);

	function start(kind: "manual" | "automatic") {
		createKind = kind;
		open = true;
	}

	async function create(name: string) {
		const key = slugify(name);
		const typeKey = types[0]?.key;
		const draft: NewRuleDraft = {
			key,
			label: name,
			input: typeKey ? { [typeKey]: { record: typeKey } } : undefined,
			trigger: createKind === "automatic" && typeKey ? { key: `${typeKey}.changed` } : undefined,
			expose: createKind === "manual" ? ["ui", "agent"] : undefined,
			steps: [],
		};
		await canonicalStudio.createRule(draft);
		await goto(`/build/automations/${key}`);
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Automations"
		description="Automations that respond to events, and manual actions people or agents can run."
	>
		{#snippet actions()}
			<Button variant="outline" href="/build/automations/runs">Workflow runs</Button>
			<Button variant="outline" onclick={() => start("manual")} disabled={!types.length}>Add manual workflow</Button>
			<Button onclick={() => start("automatic")} disabled={!types.length}>
				<PlusIcon data-icon="inline-start" />
				Add automation
			</Button>
		{/snippet}
	</PageHeader>

	{#if !workflows.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><WorkflowIcon /></Empty.Media>
				<Empty.Title>No workflows yet</Empty.Title>
				<Empty.Description>
					Add an automation like “when status becomes paid, stamp today’s date,” or a manual action like “Mark paid.”
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => start("automatic")} disabled={!types.length}>Add automation</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		{#if manualWorkflows.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Manual actions</h2>
				{#each manualWorkflows as workflow (workflow.id)}
					<a href="/build/automations/{workflow.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title class="flex items-center gap-2">
									{workflow.label}
									<Badge variant="secondary">Manual</Badge>
								</Card.Title>
								<Card.Description>{ruleSummary(workflow, canonicalStudio.context!)}</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
		{#if automaticWorkflows.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Automations</h2>
				{#each automaticWorkflows as workflow (workflow.id)}
					<a href="/build/automations/{workflow.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title class="flex items-center gap-2">
									{workflow.label}
									<Badge variant="outline">When</Badge>
								</Card.Title>
								<Card.Description>{ruleSummary(workflow, canonicalStudio.context!)}</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<NameDialog
	bind:open
	title={createKind === "manual" ? "New manual workflow" : "New automation"}
	description={createKind === "manual"
		? "A named action a person or agent can run."
		: "Runs by itself when a record changes."}
	confirm="Continue"
	onSubmit={create}
/>
