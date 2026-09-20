<script lang="ts">
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageBuilder from "$lib/components/page-builder.svelte";
	import type { PageDefinition } from "@jthum/framework/spec";
	import { isAuthoringManaged } from "@jthum/framework/svelte/authoring/data";

	const definitions = $derived(
		canonicalStudio.spec
			? canonicalStudio.spec.pages.filter(
					(page) =>
						page.key !== "home" && page.meta?.path !== "/" && !isAuthoringManaged(page.meta),
				)
			: [],
	);
	const upsertPage = (page: PageDefinition) => canonicalStudio.pageActions().save(page);
	const deletePage = (key: string) => canonicalStudio.pageActions().remove(key);
	const replacePages = (pages: readonly PageDefinition[]) => canonicalStudio.pageActions().replace(pages);
</script>

<PageBuilder
	{definitions}
	{upsertPage}
	{deletePage}
	{replacePages}
/>
