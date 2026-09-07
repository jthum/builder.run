<script lang="ts">
	import { spaceLabel } from "$lib/app/labels.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import NewTypeDialog from "$lib/components/new-type-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import BoxIcon from "@lucide/svelte/icons/box";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const types = $derived(session.snapshot?.spec.types ?? []);
	const space = $derived(spaceLabel(session.snapshot?.space.name));
	let open = $state(false);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Data"
		description="The kinds of records this app keeps. Each one gets a list, a form, and a detail screen."
	>
		{#snippet actions()}
			<Button onclick={() => (open = true)}>
				<PlusIcon data-icon="inline-start" />
				Add type
			</Button>
		{/snippet}
	</PageHeader>

	{#if !types.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><BoxIcon /></Empty.Media>
				<Empty.Title>No record types yet</Empty.Title>
				<Empty.Description>
					Name something you keep — Project, Invoice, Ticket — or start from a template. A list and forms appear
					automatically.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => (open = true)}>Add type</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="grid items-start gap-4 md:grid-cols-2">
			{#each types as type (type.id)}
				<a href="/build/types/{type.key}" class="block self-start rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<Card.Root class="h-auto transition-all hover:ring-foreground/20">
						<Card.Header class="gap-0">
							<Card.Title>{type.label}</Card.Title>
							<Card.Description>{type.collection_label ?? `${type.label} records`}</Card.Description>
							<Card.Action><Badge variant="secondary">{type.fields.length} {type.fields.length === 1 ? "field" : "fields"}</Badge></Card.Action>
						</Card.Header>
						<Card.Content class="flex flex-1 flex-col gap-3">
							{#if type.fields.length}
								<div class="flex flex-wrap gap-1.5">
									{#each type.fields.slice(0, 6) as field (field.id)}
										<Badge variant="outline">{field.label}</Badge>
									{/each}
									{#if type.fields.length > 6}
										<Badge variant="outline">+{type.fields.length - 6}</Badge>
									{/if}
								</div>
							{:else}
								<p class="text-sm text-muted-foreground">Add the first field to define what each record remembers.</p>
							{/if}
						</Card.Content>
						<Card.Footer class="justify-between gap-3">
							<span class="text-xs text-muted-foreground">{type.expose ? `Shared from ${space}` : "App type"}</span>
							<span class="flex items-center gap-1 text-sm font-medium">Open schema <ArrowRightIcon class="size-4" /></span>
						</Card.Footer>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>

<NewTypeDialog bind:open />
