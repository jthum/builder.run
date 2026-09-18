<script lang="ts">
	import "./layout.css";
	import { onMount } from "svelte";
	import { ModeWatcher } from "mode-watcher";
	import { applySpaceAccent } from "$lib/app/color.ts";
	import { breadcrumbFor } from "$lib/app/labels.ts";
	import { boot, session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { blockPresentationSpec } from "$lib/app/pages.ts";
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Breadcrumb from "@jthum/framework/svelte/ui/breadcrumb";
	import * as Sidebar from "@jthum/framework/svelte/ui/sidebar";
	import { Separator } from "@jthum/framework/svelte/ui/separator";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import { Toaster } from "@jthum/framework/svelte/ui/sonner";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { page } from "$app/state";

	let { children } = $props();

	onMount(() => {
		void boot();
	});

	const crumbs = $derived(
		page.url.pathname === "/"
			? [{ label: session.app?.name ?? "Home" }]
			: breadcrumbFor(
					page.url.pathname,
					canonicalStudio.spec && canonicalStudio.context
						? blockPresentationSpec(canonicalStudio.spec, canonicalStudio.context)
						: undefined,
				),
	);
	const docTitle = $derived(
		page.url.pathname === "/"
			? `${session.app?.name ?? "builder.run"}`
			: `${crumbs.at(-1)?.label ?? "builder.run"} · ${session.app?.name ?? "builder.run"}`,
	);
	$effect(() => {
		applySpaceAccent(session.accent);
	});
	$effect(() => {
		void session.framework;
		void canonicalStudio.refresh();
	});
</script>

<svelte:head>
	<title>{docTitle}</title>
</svelte:head>

<ModeWatcher />
<Toaster />

{#if (!session.ready || (session.framework && !canonicalStudio.context)) && !session.error && !canonicalStudio.error}
	<div class="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
		<Spinner />
		Opening your space
	</div>
{:else if session.error || canonicalStudio.error}
	<div class="flex min-h-svh items-center justify-center p-6">
		<Empty.Root class="max-w-md border-none">
			<Empty.Header>
				<Empty.Title>Couldn't open your space</Empty.Title>
				<Empty.Description>{session.error ?? canonicalStudio.error}</Empty.Description>
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
	<Sidebar.Provider>
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
