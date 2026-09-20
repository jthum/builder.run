<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import { PageHeader } from "@jthum/framework/svelte/ui/page-header";
	import * as Alert from "@jthum/framework/svelte/ui/alert";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import * as Table from "@jthum/framework/svelte/ui/table";
	import { labelFromKey } from "$lib/runtime/ids.ts";

	const actors = $derived(session.actors);
</script>

<div class="flex flex-col gap-4">
	<PageHeader title="People" description="Who can use this space. Every person is an actor; agents and the system are actors too." />
	<Alert.Root>
		<Alert.Title>Permissions come later</Alert.Title>
		<Alert.Description>
			You're signed in locally as an admin. Sign-in and agent runtimes will attach to these people — they don't replace them.
		</Alert.Description>
	</Alert.Root>
	<Table.Root
		class="overflow-hidden rounded-2xl bg-surface-chrome p-[4px] [border-collapse:separate] [border-spacing:0]"
	>
		<Table.Header class="bg-transparent">
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Kind</Table.Head>
					<Table.Head>Roles</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body
				class="bg-transparent drop-shadow-xs [&_td]:bg-card [&_tr:not(:last-child)>td]:border-b [&_tr:not(:last-child)>td]:border-border/60 [&_tr:hover>td]:bg-muted/40 [&_tr:first-child>td:first-child]:rounded-tl-[calc(var(--radius-2xl)-4px)] [&_tr:first-child>td:last-child]:rounded-tr-[calc(var(--radius-2xl)-4px)] [&_tr:last-child>td:first-child]:rounded-bl-[calc(var(--radius-2xl)-4px)] [&_tr:last-child>td:last-child]:rounded-br-[calc(var(--radius-2xl)-4px)]"
			>
				{#each actors as actor (actor.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{actor.name}</Table.Cell>
						<Table.Cell>
							<Badge variant="secondary">{labelFromKey(actor.kind)}</Badge>
						</Table.Cell>
						<Table.Cell>{actor.roles.map((role) => labelFromKey(role)).join(", ")}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
</div>
