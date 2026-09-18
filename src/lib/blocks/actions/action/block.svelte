<script lang="ts">
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import { toast } from "svelte-sonner";
	let { config }: BlockProps = $props();
	async function run() {
		const workflow = String(config.workflow ?? "");
		if (!workflow) return;
		await canonicalStudio.runRule(workflow, {});
		toast.success(String(config.label || "Done"));
	}
</script>

<Button onclick={run}>{String(config.label || "Run")}</Button>
