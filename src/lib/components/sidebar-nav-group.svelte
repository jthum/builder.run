<script lang="ts">
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { Component, Snippet } from "svelte";

	let {
		label,
		icon: Icon,
		nested = false,
		open = $bindable(true),
		children,
	}: {
		label: string;
		icon?: Component;
		nested?: boolean;
		open?: boolean;
		children: Snippet;
	} = $props();
</script>

{#if nested}
	<Sidebar.MenuSubItem>
		<Collapsible.Root bind:open class="group/nested w-full">
			<Collapsible.Trigger
				class="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
			>
				<span class="truncate">{label}</span>
				<ChevronRightIcon
					class="ms-auto size-4 shrink-0 transition-transform group-data-[state=open]/nested:rotate-90"
				/>
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Sidebar.MenuSub class="mx-0 translate-x-0 border-l-0 px-0">
					{@render children()}
				</Sidebar.MenuSub>
			</Collapsible.Content>
		</Collapsible.Root>
	</Sidebar.MenuSubItem>
{:else}
	<Collapsible.Root bind:open class="group/collapsible">
		<Sidebar.MenuItem>
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton {...props} tooltipContent={label}>
						{#if Icon}<Icon />{/if}
						<span>{label}</span>
						<ChevronRightIcon
							class="ms-auto transition-transform group-data-[state=open]/collapsible:rotate-90"
						/>
					</Sidebar.MenuButton>
				{/snippet}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Sidebar.MenuSub>
					{@render children()}
				</Sidebar.MenuSub>
			</Collapsible.Content>
		</Sidebar.MenuItem>
	</Collapsible.Root>
{/if}
