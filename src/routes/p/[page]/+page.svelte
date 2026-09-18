<script lang="ts">
	import { page } from "$app/state";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageCanvas from "$lib/components/page-canvas.svelte";
	import { blockPresentationSpec } from "$lib/app/pages.ts";
	import type { PageDefinition } from "@jthum/framework/spec";

	const pageKey = $derived(page.params.page ?? "");
	const current = $derived(canonicalStudio.spec?.pages.find((item) => item.key === pageKey));
	const presentationSpec = $derived(
		canonicalStudio.spec && canonicalStudio.context
			? blockPresentationSpec(canonicalStudio.spec, canonicalStudio.context)
			: undefined,
	);
	const startEditing = $derived(page.url.searchParams.get("edit") === "1");
	const queryView = (key: string) => canonicalStudio.queryView(key);
	const upsertPage = (draft: PageDefinition) => canonicalStudio.pageActions().save(draft);
</script>

{#if current}
	<PageCanvas
		page={current}
		title={current.label}
		{startEditing}
		spec={presentationSpec}
		revision={canonicalStudio.revision}
		{queryView}
		{upsertPage}
	/>
{:else}
	<p class="text-muted-foreground">This page isn't in the app.</p>
{/if}
