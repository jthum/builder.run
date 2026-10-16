<script lang="ts">
  import ChartMark from "$lib/components/chart-mark.svelte";
  import type { ViewDraft } from "$lib/blocks/presentation.ts";
  const view: ViewDraft = { id: "tasks", key: "tasks", label: "Tasks", source: "task", fields: ["status", "value"] };
  const rows = [{ status: "Open", value: 7 }, { status: "Done", value: 3 }];
</script>

<ChartMark mark="bar" title="First chart" {view} {rows} category="status" value="value" />
<ChartMark mark="donut" title="Second chart" {view} {rows} category="status" value="value" />
