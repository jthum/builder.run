<script lang="ts">
	import { runtime } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	import { toast } from "svelte-sonner";
	let { values }: WidgetRendererProps = $props();
	async function run() {
		const workflow = String(values.workflow ?? "");
		if (!workflow) return;
		await runtime().invoke(workflow, {});
		toast.success(String(values.label || "Done"));
	}
</script>

<Button onclick={run}>{String(values.label || "Run")}</Button>
