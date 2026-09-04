<script lang="ts">
	import "./layout.css";
	import { onMount } from "svelte";
	import { ModeWatcher } from "mode-watcher";
	import { toneFromName } from "$lib/app/color.ts";
	import { breadcrumbFor } from "$lib/app/labels.ts";
	import { boot, session } from "$lib/app/session.svelte.ts";
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Toaster } from "$lib/components/ui/sonner/index.js";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { page } from "$app/state";

	let { children } = $props();

	onMount(() => {
		void boot();
	});

	const crumbs = $derived(
		page.url.pathname === "/"
			? [{ label: session.snapshot?.app.name ?? "Home" }]
			: breadcrumbFor(page.url.pathname, session.snapshot?.spec),
	);
	const docTitle = $derived(
		page.url.pathname === "/"
			? `${session.snapshot?.app.name ?? "builder.run"}`
			: `${crumbs.at(-1)?.label ?? "builder.run"} · ${session.snapshot?.app.name ?? "builder.run"}`,
	);
	const appTone = $derived(toneFromName(session.snapshot?.app.name ?? "builder.run"));
</script>

<svelte:head>
	<title>{docTitle}</title>
</svelte:head>

<ModeWatcher />
<Toaster />

{#if !session.ready && !session.error}
	<div class="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
		<Spinner />
		Opening your space
	</div>
{:else if session.error}
	<div class="flex min-h-svh items-center justify-center p-6">
		<Empty.Root class="max-w-md border-none">
			<Empty.Header>
				<Empty.Title>Couldn't open your space</Empty.Title>
				<Empty.Description>{session.error}</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => location.reload()}>
					<RefreshCwIcon data-icon="inline-start" />
					Reload
				</Button>
			</Empty.Content>
		</Empty.Root>
	</div>
{:else}
	<Sidebar.Provider
		style="--app-gradient: {appTone.gradient}; --app-hue: {appTone.hue}; --app-accent: {appTone.accent}"
	>
		<AppSidebar />
		<Sidebar.Inset>
			<header class="flex h-16 shrink-0 items-center gap-2">
				<div class="flex items-center gap-2 px-6 md:px-8">
					<Sidebar.Trigger class="-ms-1" />
					<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
					<Breadcrumb.Root>
						<Breadcrumb.List>
							{#each crumbs as crumb, index (crumb.label + (crumb.href ?? "") + index)}
								{#if index > 0}
									<Breadcrumb.Separator />
								{/if}
								<Breadcrumb.Item>
									{#if index === crumbs.length - 1 || !crumb.href}
										<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
									{:else}
										<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
									{/if}
								</Breadcrumb.Item>
							{/each}
						</Breadcrumb.List>
					</Breadcrumb.Root>
				</div>
			</header>
			<div class="flex flex-1 flex-col gap-4 px-6 py-4 pt-0 md:px-8">
				{@render children()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
