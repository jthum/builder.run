<script lang="ts">
	import * as Card from "@jthum/framework/svelte/ui/card";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";

	let {
		label,
		count,
		description = "",
		href,
		ready = true,
	}: {
		label: string;
		count: number;
		description?: string;
		href?: string;
		ready?: boolean;
	} = $props();
</script>

{#snippet body()}
	<Card.Root class="h-full {href ? 'transition-all hover:ring-foreground/20' : ''}">
		<Card.Header>
			<span class="text-sm font-medium text-muted-foreground">{label}</span>
			{#if href}
				<Card.Action>
					<ArrowUpRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex min-h-24 flex-col justify-center gap-1.5">
			{#if ready}
				<p class="text-3xl font-semibold tracking-tight tabular-nums">{count}</p>
				{#if description}<p class="text-xs text-muted-foreground">{description}</p>{/if}
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}

{#if href}
	<a {href} class="block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
		{@render body()}
	</a>
{:else}
	{@render body()}
{/if}
