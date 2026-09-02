<script lang="ts">
	import { greeting, isBlankApp } from "$lib/app/labels.ts";
	import { openNewApp, session } from "$lib/app/session.svelte.ts";
	import PageCanvas from "$lib/components/page-canvas.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { sampleApps, templateCategories } from "$lib/runtime/samples.ts";
	import { resolveHomePage } from "$lib/runtime/widgets.ts";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import type { Component } from "svelte";

	const spec = $derived(session.snapshot?.spec);
	const blank = $derived(spec ? isBlankApp(spec) : true);
	const appName = $derived(session.snapshot?.app.name ?? "Home");
	const hello = $derived(greeting(session.snapshot?.actor.name));
	const home = $derived(spec ? resolveHomePage(spec) : null);

	const templateIcons: Record<string, Component> = {
		freelance_crm: UsersIcon,
		project_tracker: BriefcaseIcon,
		expense_approval: WalletIcon,
	};

	function categoryLabel(key: string): string {
		return templateCategories.find((item) => item.key === key)?.label ?? key;
	}
</script>

{#if blank}
	<div class="flex flex-col gap-8">
		<PageHeader
			title="Welcome"
			description="Create an app from a template, or start blank and add the records you keep."
		>
			{#snippet actions()}
				<Button onclick={() => openNewApp()}>
					<PlusIcon data-icon="inline-start" />
					New app
				</Button>
			{/snippet}
		</PageHeader>
		<div class="grid gap-4 md:grid-cols-3">
			{#each sampleApps as sample (sample.key)}
				{@const Icon = templateIcons[sample.key] ?? LayersIcon}
				<Card.Root class="h-full">
					<Card.Content class="flex h-full flex-col gap-4 p-5">
						<div class="flex items-start justify-between gap-3">
							<div class="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
								<Icon class="size-5" />
							</div>
							<Badge variant="secondary">{categoryLabel(sample.category)}</Badge>
						</div>
						<div class="flex flex-1 flex-col gap-1">
							<p class="font-medium">{sample.label}</p>
							<p class="text-sm text-muted-foreground">{sample.description}</p>
						</div>
						<Button
							size="sm"
							data-testid="load-sample"
							data-sample={sample.key}
							onclick={() => openNewApp(sample.key)}
						>
							Use template
						</Button>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</div>
{:else if home}
	<PageCanvas page={home} title={hello} description={`A snapshot of ${appName}.`} />
{/if}
