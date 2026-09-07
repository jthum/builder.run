<script lang="ts">
	import { toneFromName } from "$lib/app/color.ts";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import ReceiptIcon from "@lucide/svelte/icons/receipt";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import type { Component } from "svelte";

	let {
		label,
		count,
		href,
		source = "",
		ready = true,
	}: {
		label: string;
		count: number;
		href?: string;
		source?: string;
		ready?: boolean;
	} = $props();

	const icons: Record<string, Component> = {
		project: BriefcaseIcon,
		invoice: ReceiptIcon,
		expense: WalletIcon,
		contact: UsersIcon,
		organisation: UsersIcon,
	};
	const Icon = $derived(icons[source] ?? LayersIcon);
	const tone = $derived(toneFromName(source || label));
</script>

{#snippet body()}
	<Card.Root class="h-full {href ? 'transition-all hover:ring-foreground/20' : ''}">
		<Card.Header>
			<div class="flex items-center gap-2.5">
				<span
					class="flex size-7 items-center justify-center rounded-lg"
					style="background-color: color-mix(in oklab, {tone.accent} 12%, var(--background)); color: {tone.accent}"
				>
					<Icon />
				</span>
				<span class="text-sm font-medium text-muted-foreground">{label}</span>
			</div>
			{#if href}
				<Card.Action>
					<ArrowUpRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex min-h-24 flex-col justify-center gap-1.5">
			{#if ready}
				<p class="text-3xl font-semibold tracking-tight tabular-nums">{count}</p>
				<p class="text-xs text-muted-foreground">{count === 1 ? "1 record" : `${count} records`}</p>
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
