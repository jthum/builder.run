<script lang="ts">
	import { goto } from "$app/navigation";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const spec = $derived(session.snapshot?.spec);
	const types = $derived(spec?.types ?? []);
	const forms = $derived(spec?.forms ?? []);
	const custom = $derived(forms.filter((form) => !form.implicit));
	const builtin = $derived(forms.filter((form) => form.implicit));

	let open = $state(false);

	async function create(name: string) {
		const key = slugify(name);
		const type = types[0];
		await runtime().upsertForm({
			key,
			label: name,
			type: type?.key ?? "",
			mode: "create",
			fields: type?.fields.map((field) => field.key) ?? [],
		});
		await goto(`/build/forms/${key}`);
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Forms"
		description="Screens for adding and editing. Each kind of record already has a built-in pair."
	>
		{#snippet actions()}
			<Button onclick={() => (open = true)} disabled={!types.length}>
				<PlusIcon data-icon="inline-start" />
				Add form
			</Button>
		{/snippet}
	</PageHeader>

	{#if !forms.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><FormInputIcon /></Empty.Media>
				<Empty.Title>No forms yet</Empty.Title>
				<Empty.Description>Add a record type and default add/edit forms appear here.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#if custom.length}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">Custom</h2>
				{#each custom as form (form.id)}
					<a href="/build/forms/{form.key}">
						<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
							<Card.Header>
								<Card.Title>{form.label}</Card.Title>
								<Card.Description>
									{form.mode === "create" ? "Add" : form.mode === "edit" ? "Edit" : "Custom"}
									{types.find((type) => type.key === form.type)?.label ?? form.type}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			<h2 class="text-sm font-medium text-muted-foreground">Built-in</h2>
			{#each builtin as form (form.id)}
				<a href="/build/forms/{form.key}">
					<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
						<Card.Header>
							<Card.Title class="flex items-center gap-2">
								{form.label}
								<Badge variant="secondary">Default</Badge>
							</Card.Title>
							<Card.Description>
								{form.mode === "create" ? "Add" : "Edit"}
								{types.find((type) => type.key === form.type)?.label ?? form.type}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>

<NameDialog
	bind:open
	title="New form"
	description="A custom add or edit screen. You'll pick fields next."
	confirm="Create form"
	onSubmit={create}
/>
