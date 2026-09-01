<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NamedEditor from "$lib/components/named-editor.svelte";

	const items = $derived(session.snapshot?.spec.pages ?? []);
</script>

<NamedEditor
	title="Pages"
	description="Compose views, forms, actions, and text. Defaults already cover ordinary type pages."
	{items}
	hrefFor={(key) => `/p/${key}`}
	onCreate={async ({ key, label, extra }) => {
		const details = extra ? JSON.parse(extra) : { blocks: [] };
		await runtime().upsertPage({ key, label, ...details });
	}}
/>
