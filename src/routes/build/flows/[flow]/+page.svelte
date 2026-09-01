<script lang="ts">
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
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
		toast.success("Flow saved");
	}

	async function run() {
		if (!flow) return;
		await runtime().invoke(flow.key, JSON.parse(input || "{}"));
		toast.success("Flow invoked");
	}
</script>

{#if flow}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-semibold">{flow.label}</h1>
				<p class="text-muted-foreground">
					{flow.trigger ? `trigger: ${flow.trigger.when}` : "callable"}
					{#if flow.expose?.length}· expose {flow.expose.join(", ")}{/if}
				</p>
			</div>
			<Button onclick={run}>Invoke</Button>
		</div>
		<Card.Root>
			<Card.Header>
				<Card.Title>Definition</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Textarea class="min-h-72 font-mono text-xs" bind:value={draft} />
				<Button variant="outline" onclick={save}>Save</Button>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Input</Card.Title>
			</Card.Header>
			<Card.Content>
				<Textarea class="font-mono text-xs" bind:value={input} />
			</Card.Content>
		</Card.Root>
	</div>
{/if}
