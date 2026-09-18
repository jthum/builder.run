<script lang="ts">
	import { tick } from "svelte";
	import { assistant } from "$lib/app/assistant.svelte.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import * as Alert from "@jthum/framework/svelte/ui/alert";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import * as Sheet from "@jthum/framework/svelte/ui/sheet";
	import { cn } from "@jthum/framework/svelte/utils";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { Textarea } from "@jthum/framework/svelte/ui/textarea";
	import BotIcon from "@lucide/svelte/icons/bot";
	import SendIcon from "@lucide/svelte/icons/send";
	import SquareIcon from "@lucide/svelte/icons/square";

	let { onConfigure }: { onConfigure: () => void } = $props();
	let prompt = $state("");
	let transcript: HTMLDivElement | null = null;

	$effect(() => {
		assistant.selectApp(session.app?.id ?? "");
	});
	$effect(() => {
		if (assistant.open) void assistant.refreshConfiguration();
	});
	$effect(() => {
		void assistant.messages.length;
		void assistant.status;
		void tick().then(() => transcript?.scrollTo({ top: transcript.scrollHeight }));
	});

	async function send() {
		const content = prompt.trim();
		if (!content || assistant.running) return;
		prompt = "";
		await assistant.send(content);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== "Enter" || event.shiftKey) return;
		event.preventDefault();
		void send();
	}

	function configure() {
		assistant.open = false;
		onConfigure();
	}
</script>

<Sheet.Root bind:open={assistant.open}>
	<Sheet.Content class="w-full sm:max-w-xl" side="right">
		<Sheet.Header>
			<Sheet.Title>Assistant</Sheet.Title>
			<Sheet.Description>Build and refine {session.app?.name ?? "this app"} through conversation.</Sheet.Description>
		</Sheet.Header>

		<div bind:this={transcript} class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
			{#if assistant.checking}
				<div class="flex flex-1 items-center justify-center text-muted-foreground">
					<Spinner />
				</div>
			{:else if !assistant.configured}
				<Empty.Root class="flex-1 border-none">
					<Empty.Header>
						<Empty.Media variant="icon"><BotIcon /></Empty.Media>
						<Empty.Title>Connect a model</Empty.Title>
						<Empty.Description>
							Add an OpenAI-compatible endpoint, model, and API key in your profile settings.
						</Empty.Description>
					</Empty.Header>
					<Empty.Content>
						<Button onclick={configure}>Configure assistant</Button>
					</Empty.Content>
				</Empty.Root>
			{:else if assistant.messages.length === 0}
				<Empty.Root class="flex-1 border-none">
					<Empty.Header>
						<Empty.Media variant="icon"><BotIcon /></Empty.Media>
						<Empty.Title>What should we build?</Empty.Title>
						<Empty.Description>
							Describe the information you want to manage, or ask for a focused change to this app.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				{#each assistant.messages as message (message.id)}
					<div class={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
						<div
							class={cn(
								"max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm",
								message.role === "user"
									? "bg-primary text-primary-foreground"
									: "bg-muted text-foreground",
							)}
						>
							{message.content || "…"}
						</div>
					</div>
				{/each}
			{/if}
			{#if assistant.error}
				<Alert.Root variant="destructive">
					<Alert.Title>Assistant stopped</Alert.Title>
					<Alert.Description>{assistant.error}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if assistant.running && assistant.status}
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					<Spinner />
					{assistant.status}
				</div>
			{/if}
		</div>

		{#if assistant.configured}
			<Sheet.Footer class="flex-col gap-2 border-t bg-surface-chrome p-3">
				<Textarea
					bind:value={prompt}
					class="min-h-24 bg-background"
					placeholder="Describe what you want to build…"
					onkeydown={keydown}
					disabled={assistant.running}
				/>
				<div class="flex w-full items-center justify-between gap-2">
					<p class="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
					{#if assistant.running}
						<Button variant="outline" onclick={() => assistant.cancel()}>
							<SquareIcon data-icon="inline-start" />
							Stop
						</Button>
					{:else}
						<Button onclick={send} disabled={!prompt.trim()}>
							<SendIcon data-icon="inline-end" />
							Send
						</Button>
					{/if}
				</div>
			</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>
