<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageBuilder from "$lib/components/page-builder.svelte";
	import { authoredNavPages } from "$lib/runtime/blocks.ts";
	import { pageBlocks, pageDefinition } from "$lib/app/pages.ts";
	import type { PageDefinition } from "@jthum/framework/spec";

	const definitions = $derived(
		canonicalStudio.spec
			? canonicalStudio.spec.pages.filter((page) => page.key !== "home" && page.meta?.path !== "/")
			: session.resolvedSpec
				? authoredNavPages(session.resolvedSpec).map(pageDefinition)
				: [],
	);
	async function upsertPage(page: PageDefinition) {
		if (canonicalStudio.spec) return canonicalStudio.pageActions().save(page);
		return runtime().upsertPage({
			id: page.id,
			key: page.key,
			label: page.label,
			meta: page.meta,
			icon: typeof page.meta?.icon === "string" ? page.meta.icon : undefined,
			folder: typeof page.meta?.folder === "string" ? page.meta.folder : "",
			blocks: pageBlocks(page.layout),
		});
	}
	const deletePage = (key: string) =>
		canonicalStudio.spec ? canonicalStudio.pageActions().remove(key) : runtime().deletePage(key);
	const replacePages = (pages: readonly PageDefinition[]) =>
		canonicalStudio.spec
			? canonicalStudio.pageActions().replace(pages)
			: runtime().replaceAuthoredPages(
					pages.map((page) => ({
						id: page.id,
						key: page.key,
						label: page.label,
						meta: page.meta,
						icon: typeof page.meta?.icon === "string" ? page.meta.icon : undefined,
						folder: typeof page.meta?.folder === "string" ? page.meta.folder : undefined,
						blocks: pageBlocks(page.layout),
					})),
				);
</script>

<PageBuilder
	{definitions}
	{upsertPage}
	{deletePage}
	{replacePages}
/>
