<script lang="ts">
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { toast } from "svelte-sonner";

	const flow = $derived(session.snapshot?.spec.flows.find((item) => item.key === page.params.flow));
	let input = $state("{}");
	let draft = $state("");

	$effect(() => {
		if (flow) draft = JSON.stringify(flow, null, 2);
	});

	async function save() {
		const parsed = JSON.parse(draft);
		await runtime().upsertFlow({ ...parsed, key: flow?.key });
		toast.success("Saved");
	}

	async function run() {
		if (!flow) return;
		await runtime().invoke(flow.key, JSON.parse(input || "{}"));
		toast.success(flow.label);
	}
</script>

{#if flow}
	<div class="flex flex-col gap-4">
		<PageHeader
			title={flow.label}
			description={flow.trigger ? "Runs by itself when something changes." : "A button people can tap."}
		>
			{#snippet actions()}
				{#if !flow.trigger}
					<Button onclick={run}>Run</Button>
				{/if}
			{/snippet}
		</PageHeader>
		<Card.Root>
			<Card.Header>
				<Card.Title>Definition</Card.Title>
				<Card.Description>Advanced. The structured action editor is the usual way to change this.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Textarea class="min-h-72 font-mono text-xs" bind:value={draft} />
				<Button variant="outline" onclick={save}>Save</Button>
			</Card.Content>
		</Card.Root>
		{#if !flow.trigger}
			<Card.Root>
				<Card.Header>
					<Card.Title>Try it</Card.Title>
					<Card.Description>Optional input for a test run.</Card.Description>
				</Card.Header>
				<Card.Content>
					<Textarea class="font-mono text-xs" bind:value={input} />
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
{/if}
