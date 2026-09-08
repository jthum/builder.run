<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppNameField from "$lib/components/app-name-field.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { toast } from "svelte-sonner";

	let appId = $state("");
	let name = $state("");
	let pending = $state(false);
	const app = $derived(session.snapshot?.app);
	const changed = $derived(Boolean(name.trim()) && name.trim() !== app?.name);

	$effect(() => {
		if (!app || app.id === appId) return;
		appId = app.id;
		name = app.name;
	});

	async function save(event: Event) {
		event.preventDefault();
		if (!changed || pending) return;
		pending = true;
		try {
			await runtime().renameApp(name);
			toast.success("App settings saved");
		} finally {
			pending = false;
		}
	}
</script>

<div class="flex max-w-3xl flex-col gap-6">
	<PageHeader title="App settings" description="Manage how this app is named and presented." />
	<form onsubmit={save}>
		<Card.Root>
			<Card.Header>
				<Card.Title>General</Card.Title>
				<Card.Description>The app name appears in navigation, exports, and the app switcher.</Card.Description>
			</Card.Header>
			<Card.Content>
				<AppNameField bind:value={name} />
			</Card.Content>
			<Card.Footer class="justify-end">
				<Button type="submit" disabled={!changed || pending}>{#if pending}<Spinner data-icon="inline-start" />{/if}Save changes</Button>
			</Card.Footer>
		</Card.Root>
	</form>
</div>
