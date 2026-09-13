<script lang="ts">
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values }: WidgetRendererProps = $props();
</script>

<p class="max-w-2xl whitespace-pre-wrap text-muted-foreground">{String(values.text ?? "")}</p>
