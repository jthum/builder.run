<script lang="ts">
	import CalloutWidget from "$lib/components/callout-widget.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values }: WidgetRendererProps = $props();
</script>

<CalloutWidget title={String(values.title ?? "Note")} text={String(values.text ?? "")} tone={String(values.tone ?? "note")} />
