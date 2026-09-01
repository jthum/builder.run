<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import { toast } from "svelte-sonner";

	const types = $derived(session.snapshot?.spec.types ?? []);
	let key = $state("");
	let label = $state("");
	let store = $state("local");

	async function create() {
		const resolved = key || slugify(label);
		await runtime().upsertType({ key: resolved, label, store });
		key = "";
		label = "";
		toast.success("Type created");
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Types</h1>
		<p class="text-muted-foreground">Persistent domain data. Defaults produce views, forms, pages, and CRUD.</p>
	</div>
	<div class="flex flex-col gap-2">
		{#each types as type (type.id)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href="/build/types/{type.key}">
				<div class="font-medium">{type.label}</div>
				<div class="text-sm text-muted-foreground">{type.store}.{type.key} · {type.fields.length} fields</div>
			</a>
		{/each}
	</div>
	<div class="max-w-md">
		<Field.Group>
			<Field.Field>
				<Field.Label>Label</Field.Label>
				<Input bind:value={label} placeholder="Project" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Key</Field.Label>
				<Input bind:value={key} placeholder="project" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Store</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={store}>
					<NativeSelect.Option value="local">Workspace</NativeSelect.Option>
					<NativeSelect.Option value="directory">Directory (shared)</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>
			<Button onclick={create}>Create type</Button>
		</Field.Group>
	</div>
</div>
