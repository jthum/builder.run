<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NamedEditor from "$lib/components/named-editor.svelte";

	const items = $derived(session.snapshot?.spec.flows ?? []);
</script>

<NamedEditor
	title="Flows"
	description="Composable behaviour. Callable flows become capabilities; triggered flows become automations."
	{items}
	hrefFor={(key) => `/build/flows/${key}`}
	onCreate={async ({ key, label, extra }) => {
		const details = extra ? JSON.parse(extra) : { steps: [] };
		await runtime().upsertFlow({ key, label, ...details });
	}}
/>
