<script lang="ts">
	import { initialsFromName, toneFromName } from "$lib/app/color.ts";
	import { session, updateProfile } from "$lib/app/session.svelte.ts";
	import SettingsDialogShell from "$lib/components/settings-dialog-shell.svelte";
	import * as Avatar from "@jthum/framework/svelte/ui/avatar";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import * as Tabs from "@jthum/framework/svelte/ui/tabs";
	import * as ToggleGroup from "@jthum/framework/svelte/ui/toggle-group";
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import SunIcon from "@lucide/svelte/icons/sun";
	import UserIcon from "@lucide/svelte/icons/user";
	import { setMode, userPrefersMode } from "mode-watcher";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state("");
	let email = $state("");
	let pending = $state(false);
	let section = $state("general");
	let appearance = $state<"system" | "light" | "dark">("system");
	let initialAppearance = $state<"system" | "light" | "dark">("system");
	let initialized = $state(false);
	let committed = $state(false);
	const sections = [
		{ value: "general", label: "General", icon: UserIcon },
		{ value: "appearance", label: "Appearance", icon: PaletteIcon },
	];

	const initials = $derived(initialsFromName(name.trim() || "You"));
	const tone = $derived(toneFromName(name.trim() || "You"));

	$effect(() => {
		if (!open) {
			initialized = false;
			return;
		}
		if (initialized) return;
		name = session.actor?.name ?? "";
		email = session.actor?.email ?? "";
		appearance = userPrefersMode.current;
		initialAppearance = appearance;
		section = "general";
		committed = false;
		initialized = true;
	});

	function setOpen(value: boolean) {
		if (!value && !committed) setMode(initialAppearance);
		open = value;
	}

	function previewAppearance(value: string) {
		if (value !== "system" && value !== "light" && value !== "dark") return;
		appearance = value;
		setMode(appearance);
	}

	async function submit(event: Event) {
		event.preventDefault();
		if (!name.trim()) return;
		pending = true;
		try {
			await updateProfile({ name: name.trim(), email: email.trim() });
			committed = true;
			toast.success("Profile saved");
			open = false;
		} finally {
			pending = false;
		}
	}
</script>

<SettingsDialogShell
	{open}
	bind:section
	title="Profile settings"
	description="Manage your profile and personal appearance."
	{sections}
	onOpenChange={setOpen}
	onSubmit={submit}
>
					<Tabs.Content value="general" class="min-w-0 overflow-y-auto p-6">
						<Field.Set>
							<div class="flex flex-col gap-1">
								<Field.Legend class="mb-0">General</Field.Legend>
								<Field.Description>How you appear in this space.</Field.Description>
							</div>
							<div class="flex items-center gap-3">
								<Avatar.Root size="lg" class="size-16">
									<Avatar.Fallback
										class="text-lg font-medium"
										style="background-color: {tone.background}; color: {tone.foreground}"
									>
										{initials}
									</Avatar.Fallback>
								</Avatar.Root>
								<p class="text-sm text-muted-foreground">
									Your initials and colour update as you type.
								</p>
							</div>
							<Field.Group>
								<Field.Field>
									<Field.Label for="profile-name">Name</Field.Label>
									<Input id="profile-name" bind:value={name} placeholder="Ada Lovelace" autocomplete="name" />
								</Field.Field>
								<Field.Field>
									<Field.Label for="profile-email">Email</Field.Label>
									<Input id="profile-email" bind:value={email} type="email" placeholder="ada@example.com" autocomplete="email" />
									<Field.Description>Used in this space only. Sign-in comes later.</Field.Description>
								</Field.Field>
							</Field.Group>
						</Field.Set>
					</Tabs.Content>

					<Tabs.Content value="appearance" class="min-w-0 overflow-y-auto p-6">
						<Field.Set>
							<div class="flex flex-col gap-1">
								<Field.Legend class="mb-0">Appearance</Field.Legend>
								<Field.Description>
									Choose how builder.run looks for you on this browser.
								</Field.Description>
							</div>
							<Field.Group>
								<Field.Field>
									<Field.Label>Colour mode</Field.Label>
									<ToggleGroup.Root
										type="single"
										variant="outline"
										spacing={2}
										value={appearance}
										onValueChange={previewAppearance}
										class="flex-wrap"
									>
										<ToggleGroup.Item value="system" aria-label="Use system colour mode">
											<MonitorIcon data-icon="inline-start" />
											System
										</ToggleGroup.Item>
										<ToggleGroup.Item value="light" aria-label="Use light mode">
											<SunIcon data-icon="inline-start" />
											Light
										</ToggleGroup.Item>
										<ToggleGroup.Item value="dark" aria-label="Use dark mode">
											<MoonIcon data-icon="inline-start" />
											Dark
										</ToggleGroup.Item>
									</ToggleGroup.Root>
									<Field.Description>
										System follows your device setting. Your preference is stored in this browser.
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
