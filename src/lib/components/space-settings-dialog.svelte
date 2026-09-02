<script lang="ts">
	import { spaceLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state("");
	let pending = $state(false);

	$effect(() => {
		if (!open) return;
		name = spaceLabel(session.snapshot?.space.name);
	});

	async function submit(event: Event) {
		event.preventDefault();
		if (!name.trim()) return;
		pending = true;
		try {
			await runtime().renameSpace(name.trim());
			toast.success("Space saved");
			open = false;
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Space settings</Dialog.Title>
				<Dialog.Description>
					A space holds your apps, people, and any types you expose to those apps.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body>
				<Field.Field>
					<Field.Label>Space name</Field.Label>
					<Input bind:value={name} placeholder="Personal Space" />
				</Field.Field>
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !name.trim()}>
					{#if pending}<Spinner data-icon="inline-start" />{/if}
					Save
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
