<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NamedEditor from "$lib/components/named-editor.svelte";

	const items = $derived(session.snapshot?.spec.forms ?? []);
</script>

<NamedEditor
	title="Forms"
	description="Reusable input. Types already get default create and edit forms."
	{items}
	hrefFor={(key) => `/build/forms/${key}`}
	onCreate={async ({ key, label, extra }) => {
		const details = extra ? JSON.parse(extra) : {};
		await runtime().upsertForm({ key, label, ...details });
	}}
/>
