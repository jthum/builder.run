<script lang="ts">
	import RecordForm from "$lib/components/record-form.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, spec }: BlockProps = $props();
	const form = $derived(spec?.forms.find((item) => item.key === String(config.form ?? "")));
	const type = $derived(spec?.types.find((item) => item.key === form?.type));
</script>

{#if form && (form.mode === "standalone" || type)}
	<Card.Root class="w-full"><Card.Header><Card.Title>{String(config.title || form.label)}</Card.Title></Card.Header><Card.Content><RecordForm {type} {form} fields={form.fields} fullWidth /></Card.Content></Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a form for this block.</p>{/if}
