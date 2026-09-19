<script lang="ts">
	import { renameApp, session } from "$lib/app/session.svelte.ts";
	import AppNameField from "$lib/components/app-name-field.svelte";
	import SettingsDialogShell from "$lib/components/settings-dialog-shell.svelte";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import * as Tabs from "@jthum/framework/svelte/ui/tabs";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import ZapIcon from "@lucide/svelte/icons/zap";
	import WorkspaceSettings from "@jthum/framework/svelte/studio/workspace-settings";
	import WorkspaceActions from "@jthum/framework/svelte/studio/workspace-actions";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state("");
	let section = $state("general");
	let pending = $state(false);
	let initialized = $state(false);
	const sections = [
		{ value: "general", label: "General", icon: SettingsIcon },
		{ value: "settings", label: "Settings", icon: KeyRoundIcon },
		{ value: "actions", label: "Actions", icon: ZapIcon },
	];
	const actionKinds = [{
		kind: "delegate",
		label: "Delegate to Action",
		description: "Read an Action key from a setting and pass the input to that Action.",
		configFields: [{ key: "settingKey", label: "Provider setting key", placeholder: "search_provider" }],
	}];

	$effect(() => {
		if (!open) {
			initialized = false;
			return;
		}
		if (initialized) return;
		name = session.app?.name ?? "";
		section = "general";
		initialized = true;
	});

	function setOpen(value: boolean) {
		open = value;
	}

	async function submit(event: Event) {
		event.preventDefault();
		if (section !== "general") return;
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
	description="Manage this app's identity, settings, and reusable Actions."
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
	<Tabs.Content value="settings" class="min-w-0 overflow-y-auto p-6">
		<WorkspaceSettings client={session.framework?.appClient} secretStorageNote="In this browser, secret values are not encrypted." />
	</Tabs.Content>
	<Tabs.Content value="actions" class="min-w-0 overflow-y-auto p-6">
		<WorkspaceActions client={session.framework?.appClient} kinds={actionKinds} onChanged={() => session.revision += 1} />
	</Tabs.Content>
	{#snippet actions()}
		{#if section === "settings" || section === "actions"}
			<Button type="button" variant="outline" onclick={() => setOpen(false)}>Close</Button>
		{:else}
			<Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
			<Button type="submit" disabled={pending || !name.trim() || name.trim() === session.app?.name}>
				{#if pending}<Spinner data-icon="inline-start" />{/if}
				Save
			</Button>
		{/if}
	{/snippet}
</SettingsDialogShell>
