<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NamedEditor from "$lib/components/named-editor.svelte";

	const items = $derived(session.snapshot?.spec.views ?? []);
</script>

<NamedEditor
	title="Views"
	description="Named queries over the logical application model."
	{items}
	hrefFor={(key) => `/v/${key}`}
	onCreate={async ({ key, label, extra }) => {
		const details = extra ? JSON.parse(extra) : {};
		await runtime().upsertView({ key, label, ...details });
	}}
/>
