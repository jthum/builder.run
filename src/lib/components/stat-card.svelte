<script lang="ts">
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
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
	const tones: Record<string, string> = {
		project: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
		invoice: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
		expense: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
	};
	const Icon = $derived(icons[source] ?? LayersIcon);
	const tone = $derived(tones[source] ?? "bg-muted text-foreground/70");
</script>

{#snippet body()}
	<Card.Root class="h-full {href ? 'transition-all hover:ring-foreground/20' : ''}">
		<Card.Content class="flex flex-col gap-3 p-5">
			<div class="flex items-center gap-2 text-muted-foreground">
				<span class="flex size-8 items-center justify-center rounded-lg {tone}">
					<Icon class="size-4" />
				</span>
				<span class="text-sm font-medium">{label}</span>
			</div>
			{#if ready}
				<p class="text-3xl font-semibold tracking-tight tabular-nums">{count}</p>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}

{#if href}
	<a {href} class="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
		{@render body()}
	</a>
{:else}
	{@render body()}
{/if}
