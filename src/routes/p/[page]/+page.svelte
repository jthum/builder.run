<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageCanvas from "$lib/components/page-canvas.svelte";
	import { resolvePage } from "$lib/runtime/blocks.ts";
	import { pageDefinition } from "$lib/app/pages.ts";
	import type { PageDefinition } from "@jthum/framework/spec";

	const pageKey = $derived(page.params.page ?? "");
	const spec = $derived(session.resolvedSpec);
	const legacyPage = $derived(spec ? resolvePage(spec, pageKey) : undefined);
	const current = $derived(
		canonicalStudio.spec
			? canonicalStudio.spec.pages.find((item) => item.key === pageKey)
			: legacyPage
				? pageDefinition(legacyPage)
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
		spec={session.resolvedSpec}
		revision={canonicalStudio.revision}
		{queryView}
		{upsertPage}
	/>
{:else}
	<p class="text-muted-foreground">This page isn't in the app.</p>
{/if}
