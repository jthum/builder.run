<script lang="ts">
	import { renameApp, session } from "$lib/app/session.svelte.ts";
	import AppNameField from "$lib/components/app-name-field.svelte";
	import SettingsDialogShell from "$lib/components/settings-dialog-shell.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state("");
	let section = $state("general");
	let pending = $state(false);
	let initialized = $state(false);
	const sections = [{ value: "general", label: "General", icon: SettingsIcon }];

	$effect(() => {
		if (!open) {
			initialized = false;
			return;
		}
		if (initialized) return;
		name = session.snapshot?.app.name ?? "";
		section = "general";
		initialized = true;
	});

	function setOpen(value: boolean) {
		open = value;
	}

	async function submit(event: Event) {
		event.preventDefault();
		const next = name.trim();
		if (!next || pending) return;
		pending = true;
		try {
			await renameApp(next);
			toast.success("App settings saved");
			open = false;
		} finally {
			pending = false;
		}
	}
</script>

<SettingsDialogShell
	{open}
	bind:section
	title="App settings"
	description="Manage how this app is named and presented."
	{sections}
	onOpenChange={setOpen}
	onSubmit={submit}
>
	<Tabs.Content value="general" class="min-w-0 overflow-y-auto p-6">
		<Field.Set>
			<div class="flex flex-col gap-1">
				<Field.Legend class="mb-0">General</Field.Legend>
				<Field.Description>The app name appears in navigation, exports, and the app switcher.</Field.Description>
			</div>
			<Field.Group>
				<AppNameField id="dialog-app-name" bind:value={name} autofocus />
			</Field.Group>
		</Field.Set>
	</Tabs.Content>
	{#snippet actions()}
		<Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
		<Button type="submit" disabled={pending || !name.trim() || name.trim() === session.snapshot?.app.name}>
			{#if pending}<Spinner data-icon="inline-start" />{/if}
			Save
		</Button>
	{/snippet}
</SettingsDialogShell>
