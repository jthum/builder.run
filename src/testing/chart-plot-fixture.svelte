<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children: Snippet<[{ width: number; height: number }]> } = $props();
</script>

{@render children({ width: 640, height: 320 })}
