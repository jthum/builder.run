<script lang="ts">
	import { tick } from "svelte";
	import { assistant } from "$lib/app/assistant.svelte.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import { DEFAULT_ASSISTANT_SETTINGS, saveAssistantSettings, assistantConfigured } from "$lib/inference/settings.ts";
	import AssistantSettingsFields from "$lib/components/assistant-settings-fields.svelte";
	import { buildTools, getWebMcpAppToolMode } from "$lib/app/webmcp.ts";
	import { toolContext } from "$lib/app/session.svelte.ts";
	import * as Alert from "@jthum/framework/svelte/ui/alert";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import * as Sheet from "@jthum/framework/svelte/ui/sheet";
	import { cn } from "@jthum/framework/svelte/utils";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { Textarea } from "@jthum/framework/svelte/ui/textarea";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import CheckIcon from "@lucide/svelte/icons/check";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import BotIcon from "@lucide/svelte/icons/bot";
	import SendIcon from "@lucide/svelte/icons/send";
	import SquareIcon from "@lucide/svelte/icons/square";

	let prompt = $state("");
	let configuration = $state(false);
	let saving = $state(false);
	let baseUrl = $state(DEFAULT_ASSISTANT_SETTINGS.baseUrl);
	let model = $state("");
	let apiKey = $state("");
	let transcript: HTMLDivElement | null = null;
	let composer = $state<HTMLTextAreaElement | null>(null);
	const tools = $derived.by(() => {
		void session.revision;
		return session.framework ? buildTools(toolContext, { appTools: getWebMcpAppToolMode() }) : [];
	});

	$effect(() => {
		assistant.selectApp(session.app?.id ?? "", session.space?.id ?? "", session.actor?.id ?? "");
	});
	$effect(() => {
		if (assistant.open) void loadConfiguration();
	});
	$effect(() => {
		void assistant.messages.at(-1)?.content;
		void assistant.messages.at(-1)?.reasoning;
		void assistant.status;
		void tick().then(() => transcript?.scrollTo({ top: transcript.scrollHeight }));
	});

	async function loadConfiguration() {
		try {
			const settings = await assistant.refreshConfiguration();
			baseUrl = settings.baseUrl;
			model = settings.model;
			apiKey = settings.apiKey;
			configuration = !assistantConfigured(settings);
		} catch (error) {
			assistant.error = error instanceof Error ? error.message : "Could not load model settings.";
		}
	}

	async function saveConfiguration(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			await saveAssistantSettings({ baseUrl, model, apiKey });
			await assistant.refreshConfiguration();
			assistant.error = null;
			configuration = false;
			await tick();
			composer?.focus();
		} catch (error) {
			assistant.error = error instanceof Error ? error.message : "Could not save model settings.";
		} finally { saving = false; }
	}

	async function send() {
		const content = prompt.trim();
		if (!content || assistant.running) return;
		prompt = "";
		await assistant.send(content);
		await tick();
		composer?.focus();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		void send();
	}

</script>

<Sheet.Root bind:open={assistant.open}>
	<Sheet.Content class="w-full sm:max-w-xl" side="right">
		<Sheet.Header>
			<Sheet.Title>Assistant</Sheet.Title>
			<Sheet.Description>Build and work with {session.app?.name ?? "this app"} through conversation.</Sheet.Description>
			<div class="flex items-center justify-between gap-2 pt-2">
				<p class="truncate text-xs text-muted-foreground">{assistant.model || "No model connected"}</p>
				<div class="flex shrink-0 gap-1">
					<Button variant="ghost" size="icon-sm" aria-label="New conversation" title="New conversation" disabled={assistant.running || !assistant.messages.length} onclick={() => assistant.clear()}><PlusIcon /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Model settings" title="Model settings" disabled={assistant.running || assistant.checking} onclick={() => configuration = !configuration}><SettingsIcon /></Button>
				</div>
			</div>
		</Sheet.Header>

		<div bind:this={transcript} class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
			{#if assistant.checking}
				<div class="flex flex-1 items-center justify-center text-muted-foreground">
					<Spinner />
				</div>
			{:else if configuration}
				<form class="flex flex-col gap-6" onsubmit={saveConfiguration}>
					<Field.Set>
						<Field.Legend>Connect a model</Field.Legend>
						<Field.Description>Use an OpenAI-compatible provider or a local model endpoint.</Field.Description>
						<AssistantSettingsFields bind:baseUrl bind:model bind:apiKey disabled={saving} />
					</Field.Set>
					<div class="flex justify-end gap-2">
						{#if assistant.configured}<Button type="button" variant="outline" disabled={saving} onclick={() => configuration = false}>Cancel</Button>{/if}
						<Button type="submit" disabled={saving || !model.trim() || !baseUrl.trim()}>{#if saving}<Spinner data-icon="inline-start" />{/if}Save connection</Button>
					</div>
				</form>
			{:else if !assistant.configured}
				<Empty.Root class="flex-1 border-none">
					<Empty.Header>
						<Empty.Media variant="icon"><BotIcon /></Empty.Media>
						<Empty.Title>Connect a model</Empty.Title>
						<Empty.Description>
							Choose an OpenAI-compatible endpoint and model to get started.
						</Empty.Description>
					</Empty.Header>
					<Empty.Content>
						<Button onclick={() => configuration = true}>Configure assistant</Button>
					</Empty.Content>
				</Empty.Root>
			{:else if assistant.messages.length === 0}
				<Empty.Root class="flex-1 border-none">
					<Empty.Header>
						<Empty.Media variant="icon"><BotIcon /></Empty.Media>
						<Empty.Title>What should we build?</Empty.Title>
						<Empty.Description>
							Describe an app to build, refine its screens, or ask about your data. The Assistant can use the same tools as WebMCP under your permissions.
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
							{#if message.tools?.length}
								<details class="mt-3 whitespace-normal">
									<summary class="cursor-pointer text-xs text-muted-foreground">{message.tools.length} tool {message.tools.length === 1 ? "call" : "calls"}</summary>
									<ul class="mt-2 flex list-none flex-col gap-2 p-0">
										{#each message.tools as call (call.id)}
											<li class="flex items-start gap-2 text-xs">
												{#if call.status === "running"}<Spinner class="size-3" />{:else if call.status === "completed"}<CheckIcon class="size-3" />{:else}<CircleAlertIcon class="size-3" />{/if}
												<div><span>{call.label} · {call.status}</span>{#if call.error}<p class="mt-1 text-destructive">{call.error}</p>{/if}</div>
											</li>
										{/each}
									</ul>
								</details>
							{/if}
							{#if message.reasoning}
								<details class="mt-3"><summary class="cursor-pointer text-xs text-muted-foreground">Model reasoning</summary><p class="mt-2 text-xs text-muted-foreground">{message.reasoning}</p></details>
							{/if}
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

		{#if assistant.configured && !configuration}
			<Sheet.Footer class="flex-col gap-2 border-t bg-surface-chrome p-3">
				<details class="w-full text-xs text-muted-foreground">
					<summary class="cursor-pointer">{tools.length} available tools</summary>
					<ul class="mt-2 flex max-h-40 list-none flex-col gap-2 overflow-y-auto p-0">{#each tools as tool (tool.name)}<li><span class="font-medium text-foreground">{tool.name}</span> — {tool.description}</li>{/each}</ul>
				</details>
				<Field.Group class="w-full">
				<Field.Field data-disabled={assistant.running}>
					<Field.Label for="assistant-prompt" class="sr-only">Message to the Assistant</Field.Label>
					<Textarea
					id="assistant-prompt"
					bind:ref={composer}
					bind:value={prompt}
					class="min-h-24 bg-background"
					placeholder="Describe what you want to build…"
					onkeydown={keydown}
					disabled={assistant.running}
				/>
				</Field.Field>
				</Field.Group>
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
