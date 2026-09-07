<script lang="ts">
	import { goto } from "$app/navigation";
	import { flowKind, flowSummary } from "$lib/app/relations.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";

	const spec = $derived(session.snapshot?.spec);
	const flows = $derived(spec?.flows ?? []);
	const types = $derived(spec?.types ?? []);
	const buttons = $derived(flows.filter((flow) => flowKind(flow) === "button"));
	const rules = $derived(flows.filter((flow) => flowKind(flow) === "rule"));

	let createKind = $state<"button" | "rule">("rule");
	let open = $state(false);

	function start(kind: "button" | "rule") {
		createKind = kind;
		open = true;
	}

	async function create(name: string) {
		const key = slugify(name);
		const typeKey = types[0]?.key;
		await runtime().upsertFlow({
			key,
			label: name,
			input: typeKey ? { [typeKey]: { record: typeKey } } : undefined,
			trigger: createKind === "rule" && typeKey ? { key: `${typeKey}.changed` } : undefined,
			expose: createKind === "button" ? ["ui", "agent"] : undefined,
			steps: [],
		});
		await goto(`/build/flows/${key}`);
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Rules"
		description="Automations that respond to events, and manual actions people or agents can run."
	>
		{#snippet actions()}
			<Button variant="outline" onclick={() => start("button")} disabled={!types.length}>Add manual action</Button>
			<Button onclick={() => start("rule")} disabled={!types.length}>
				<PlusIcon data-icon="inline-start" />
				Add automation
			</Button>
		{/snippet}
	</PageHeader>

	{#if !flows.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><WorkflowIcon /></Empty.Media>
				<Empty.Title>No rules yet</Empty.Title>
				<Empty.Description>
					Add an automation like “when status becomes paid, stamp today’s date,” or a manual action like “Mark paid.”
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => start("rule")} disabled={!types.length}>Add automation</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		{#if buttons.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Manual actions</h2>
				{#each buttons as flow (flow.id)}
					<a href="/build/flows/{flow.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title class="flex items-center gap-2">
									{flow.label}
									<Badge variant="secondary">Manual</Badge>
								</Card.Title>
								<Card.Description>{flowSummary(flow, spec)}</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
		{#if rules.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Automations</h2>
				{#each rules as flow (flow.id)}
					<a href="/build/flows/{flow.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title class="flex items-center gap-2">
									{flow.label}
									<Badge variant="outline">When</Badge>
								</Card.Title>
								<Card.Description>{flowSummary(flow, spec)}</Card.Description>
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
	title={createKind === "button" ? "New manual action" : "New automation"}
	description={createKind === "button"
		? "A named action a person or agent can run."
		: "Runs by itself when a record changes."}
	confirm="Continue"
	onSubmit={create}
/>
