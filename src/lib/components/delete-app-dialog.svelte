<script lang="ts">
	import { goto } from "$app/navigation";
	import { deleteApp, session } from "$lib/app/session.svelte.ts";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Dialog from "@jthum/framework/svelte/ui/dialog";
	import * as Field from "@jthum/framework/svelte/ui/field";
	import { Input } from "@jthum/framework/svelte/ui/input";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const app = $derived(session.app);
	const last = $derived(session.apps.length <= 1);

	let typed = $state("");
	let pending = $state(false);

	const matches = $derived(Boolean(app && typed.trim() === app.name));
	const description = $derived(
		[
			"This removes the app and its records in this space. Shared organisations and contacts stay.",
			last ? "A blank app will take its place." : "",
			"This cannot be undone.",
		]
			.filter(Boolean)
			.join(" "),
	);

	$effect(() => {
		if (open) typed = "";
	});

	async function submit(event: Event) {
		event.preventDefault();
		if (!app || !matches) return;
		pending = true;
		try {
			await deleteApp(app.id);
			toast.success(`${app.name} deleted`);
			open = false;
			await goto("/");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete the app");
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Delete {app?.name ?? "this app"}?</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body>
				<Field.Field>
					<Field.Label>Type {app?.name ?? "the app name"} to confirm</Field.Label>
					<Input bind:value={typed} placeholder={app?.name} autocomplete="off" data-testid="delete-app-name" />
				</Field.Field>
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button
					type="submit"
					variant="destructive"
					disabled={pending || !matches}
					data-testid="delete-app-confirm"
				>
					{#if pending}<Spinner data-icon="inline-start" />{/if}
					Delete app
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
