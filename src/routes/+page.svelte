<script lang="ts">
	import { greeting } from "$lib/app/labels.ts";
	import { openNewApp, session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageCanvas from "$lib/components/page-canvas.svelte";
	import { PageHeader } from "@jthum/framework/svelte/studio";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import type { PageDefinition } from "@jthum/framework/spec";
	import { pageContext } from "$lib/app/pages.ts";
	import { appTemplates, templateCategories } from "$lib/app/templates/index.ts";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import type { Component } from "svelte";

	const blank = $derived(
		canonicalStudio.spec
			? canonicalStudio.spec.collections.length === 0 && canonicalStudio.spec.views.length === 0
			: true,
	);
	const appName = $derived(session.app?.name ?? "Home");
	const hello = $derived(greeting(session.actor?.name));
	const home = $derived(
		canonicalStudio.spec?.pages.find((page) => page.key === "home" || page.meta?.path === "/"),
	);
	const presentationSpec = $derived(
		canonicalStudio.spec && canonicalStudio.context
			? pageContext(canonicalStudio.spec, canonicalStudio.context)
			: undefined,
	);
	const queryView = (key: string) => canonicalStudio.queryView(key);
	const upsertPage = (draft: PageDefinition) => canonicalStudio.pageActions().save(draft);

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
			{#each appTemplates as sample (sample.key)}
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
					</Card.Content>
					<Card.Footer>
						<Button
							size="sm"
							class="w-full"
							data-testid="load-sample"
							data-sample={sample.key}
							onclick={() => openNewApp(sample.key)}
						>
							Use template
						</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	</div>
{:else if home}
	<PageCanvas
		page={home}
		title={hello}
		description={`A snapshot of ${appName}.`}
		spec={presentationSpec}
		revision={canonicalStudio.revision}
		{queryView}
		{upsertPage}
	/>
{/if}
