<script lang="ts">
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { Component, Snippet } from "svelte";

	let {
		label,
		icon: Icon,
		open = $bindable(true),
		children,
	}: {
		label: string;
		icon?: Component;
		open?: boolean;
		children: Snippet;
	} = $props();
</script>

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
