<script lang="ts">
	import "./layout.css";
	import { onMount } from "svelte";
	import { ModeWatcher } from "mode-watcher";
	import { boot, session } from "$lib/app/session.svelte.ts";
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Toaster } from "$lib/components/ui/sonner/index.js";
	import { page } from "$app/state";
	import favicon from "$lib/assets/favicon.svg";

	let { children } = $props();

	onMount(() => {
		void boot();
	});

	const crumbs = $derived(page.url.pathname.split("/").filter(Boolean));
</script>

<svelte:head>
	<title>builder.run</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Toaster />

{#if !session.ready && !session.error}
	<div class="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
		<Spinner />
		Starting builder.run
	</div>
{:else if session.error}
	<div class="flex min-h-svh items-center justify-center p-6">
		<p class="text-destructive">{session.error}</p>
	</div>
{:else}
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset>
			<header class="flex h-16 shrink-0 items-center gap-2">
				<div class="flex items-center gap-2 px-4">
					<Sidebar.Trigger class="-ms-1" />
					<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
					<Breadcrumb.Root>
						<Breadcrumb.List>
							<Breadcrumb.Item>
								<Breadcrumb.Link href="/">builder.run</Breadcrumb.Link>
							</Breadcrumb.Item>
							{#each crumbs as crumb, index (crumb)}
								<Breadcrumb.Separator />
								<Breadcrumb.Item>
									{#if index === crumbs.length - 1}
										<Breadcrumb.Page class="capitalize">{crumb}</Breadcrumb.Page>
									{:else}
										<Breadcrumb.Link class="capitalize" href="/{crumbs.slice(0, index + 1).join('/')}">{crumb}</Breadcrumb.Link>
									{/if}
								</Breadcrumb.Item>
							{/each}
						</Breadcrumb.List>
					</Breadcrumb.Root>
				</div>
			</header>
			<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
				{@render children()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
