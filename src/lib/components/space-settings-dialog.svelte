<script lang="ts">
	import { spaceLabel } from "$lib/app/labels.ts";
	import { applySpaceAccent, SPACE_ACCENTS, toneFromAccent } from "$lib/app/color.ts";
	import {
		configureWebMcpAppToolMode,
		runtime,
		session,
	} from "$lib/app/session.svelte.ts";
	import SettingsDialogShell from "$lib/components/settings-dialog-shell.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import type { SpaceAccent } from "$lib/runtime/platform.ts";
	import BotIcon from "@lucide/svelte/icons/bot";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state("");
	let pending = $state(false);
	let typedTools = $state(false);
	let accent = $state<SpaceAccent>("blue");
	let section = $state("general");
	let initialAccent = $state<SpaceAccent>("blue");
	let initialized = $state(false);
	let committed = $state(false);
	const sections = [
		{ value: "general", label: "General", icon: Settings2Icon },
		{ value: "agents", label: "Agent tools", icon: BotIcon },
		{ value: "appearance", label: "Appearance", icon: PaletteIcon },
	];

	$effect(() => {
		if (!open) {
			initialized = false;
			return;
		}
		if (initialized) return;
		name = spaceLabel(session.snapshot?.space.name);
		typedTools = session.webmcpToolMode === "typed";
		accent = session.snapshot?.space.appearance?.accent ?? "blue";
		initialAccent = accent;
		section = "general";
		committed = false;
		initialized = true;
	});

	function setOpen(value: boolean) {
		if (!value && !committed) applySpaceAccent(initialAccent);
		open = value;
	}

	function previewAccent(value: string) {
		const option = SPACE_ACCENTS.find((item) => item.key === value);
		if (!option) return;
		accent = option.key;
		applySpaceAccent(accent);
	}

	async function submit(event: Event) {
		event.preventDefault();
		if (!name.trim()) return;
		pending = true;
		try {
			await runtime().updateSpaceAppearance(accent);
			await runtime().renameSpace(name.trim());
			configureWebMcpAppToolMode(typedTools ? "typed" : "compact");
			committed = true;
			toast.success("Space saved");
			open = false;
		} finally {
			pending = false;
		}
	}
</script>

<SettingsDialogShell
	{open}
	bind:section
	title="Space settings"
	description="Manage this space and how browser agents interact with its apps."
	{sections}
	onOpenChange={setOpen}
	onSubmit={submit}
>
					<Tabs.Content value="general" class="min-w-0 overflow-y-auto p-6">
						<Field.Set>
							<div class="flex flex-col gap-1">
								<Field.Legend class="mb-0">General</Field.Legend>
								<Field.Description>
									A space holds your apps, people, and types shared between apps.
								</Field.Description>
							</div>
							<Field.Group>
								<Field.Field>
									<Field.Label for="space-name">Space name</Field.Label>
									<Input id="space-name" bind:value={name} placeholder="Personal Space" />
									<Field.Description>
										Shown in the workspace switcher and throughout the builder.
									</Field.Description>
								</Field.Field>
							</Field.Group>
						</Field.Set>
					</Tabs.Content>

					<Tabs.Content value="agents" class="min-w-0 overflow-y-auto p-6">
						<Field.Set>
							<div class="flex flex-col gap-1">
								<Field.Legend class="mb-0">Agent tools</Field.Legend>
								<Field.Description>
									Choose how this browser advertises app record operations over WebMCP.
								</Field.Description>
							</div>
							<Field.Group>
								<Field.Field orientation="horizontal" class="rounded-xl border p-4">
									<Field.Content>
										<Field.Label for="typed-webmcp-tools">Typed WebMCP tools</Field.Label>
										<Field.Description>
											Register explicit tools such as create_invoice with fully expanded field
											schemas. This can help smaller models with small apps.
										</Field.Description>
									</Field.Content>
									<Switch bind:checked={typedTools} id="typed-webmcp-tools" />
								</Field.Field>
								<Field.Description>
									Compact tools are recommended for larger apps because their number and schemas stay
									stable as Types are added. This preference is stored only in this browser and is not
									part of the exported app spec.
								</Field.Description>
							</Field.Group>
						</Field.Set>
					</Tabs.Content>

					<Tabs.Content value="appearance" class="min-w-0 overflow-y-auto p-6">
						<Field.Set>
							<div class="flex flex-col gap-1">
								<Field.Legend class="mb-0">Appearance</Field.Legend>
								<Field.Description>
									Set the shared visual accent for every app in this space.
								</Field.Description>
							</div>
							<Field.Group>
								<Field.Field>
									<Field.Label>Accent colour</Field.Label>
									<ToggleGroup.Root
										type="single"
										variant="outline"
										spacing={2}
										value={accent}
										onValueChange={previewAccent}
										class="flex-wrap"
									>
										{#each SPACE_ACCENTS as option (option.key)}
											{@const tone = toneFromAccent(option.key)}
											<ToggleGroup.Item value={option.key} aria-label={`${option.label} accent`}>
												<span
													class="size-3 rounded-full"
													style={`background-color: ${tone.accent}`}
												></span>
												{option.label}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
									<Field.Description>
										Blue is the default. The accent applies to navigation, controls, charts, and app
										identity across this space.
									</Field.Description>
								</Field.Field>
							</Field.Group>
						</Field.Set>
					</Tabs.Content>
	{#snippet actions()}
		<Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
		<Button type="submit" disabled={pending || !name.trim()}>
			{#if pending}<Spinner data-icon="inline-start" />{/if}
			Save
		</Button>
	{/snippet}
</SettingsDialogShell>
