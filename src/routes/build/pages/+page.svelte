<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageBuilder from "$lib/components/page-builder.svelte";
	import type { PageDef } from "$lib/runtime/model.ts";

	const upsertPage = (draft: Partial<PageDef> & { key: string }) => runtime().upsertPage(draft);
	const deletePage = (key: string) => runtime().deletePage(key);
	const replacePages = (pages: PageDef[]) => runtime().replaceAuthoredPages(pages);
</script>

<PageBuilder
	spec={session.resolvedSpec}
	{upsertPage}
	{deletePage}
	{replacePages}
/>
