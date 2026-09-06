<script lang="ts">
	import { initialsFromName, toneFromName } from "$lib/app/color.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import * as Avatar from "$lib/components/ui/avatar/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { toast } from "svelte-sonner";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state("");
	let email = $state("");
	let pending = $state(false);

	const initials = $derived(initialsFromName(name.trim() || "You"));
	const tone = $derived(toneFromName(name.trim() || "You"));

	$effect(() => {
		if (!open) return;
		name = session.snapshot?.actor.name ?? "";
		email = session.snapshot?.actor.email ?? "";
	});

	async function submit(event: Event) {
		event.preventDefault();
		if (!name.trim()) return;
		pending = true;
		try {
			await runtime().updateActor({ name: name.trim(), email: email.trim() });
			toast.success("Profile saved");
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
				<Dialog.Title>Profile</Dialog.Title>
				<Dialog.Description>How you appear in this space.</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="flex flex-col gap-5">
				<div class="flex flex-col items-center gap-3">
					<Avatar.Root size="lg" class="size-16">
						<Avatar.Fallback
							class="text-lg font-medium"
							style="background-color: {tone.background}; color: {tone.foreground}"
						>
							{initials}
						</Avatar.Fallback>
					</Avatar.Root>
					<p class="text-sm text-muted-foreground">Your initials and colour update as you type.</p>
				</div>
				<Field.Group>
					<Field.Field>
						<Field.Label>Name</Field.Label>
						<Input bind:value={name} placeholder="Ada Lovelace" autocomplete="name" />
					</Field.Field>
					<Field.Field>
						<Field.Label>Email</Field.Label>
						<Input bind:value={email} type="email" placeholder="ada@example.com" autocomplete="email" />
						<Field.Description>Used in this space only. Sign-in comes later.</Field.Description>
					</Field.Field>
				</Field.Group>
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
