<script lang="ts">
	import { runtime } from "$lib/app/session.svelte.ts";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import { toast } from "svelte-sonner";
	let { config }: BlockProps = $props();
	async function run() {
		const workflow = String(config.workflow ?? "");
		if (!workflow) return;
		await runtime().invoke(workflow, {});
		toast.success(String(config.label || "Done"));
	}
</script>

<Button onclick={run}>{String(config.label || "Run")}</Button>
