<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
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
		toast.success("Added");
	}
</script>

<div class="flex flex-col gap-6">
	<PageHeader title="Data" description="The kinds of records this app keeps. Each one gets a list, a form, and a detail screen." />
	<div class="flex flex-col gap-2">
		{#each types as type (type.id)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href="/build/types/{type.key}">
				<div class="font-medium">{type.label}</div>
				<div class="text-sm text-muted-foreground">
					{type.store === "directory" ? "Shared across apps" : "Only in this app"}
					· {type.fields.length} {type.fields.length === 1 ? "field" : "fields"}
				</div>
			</a>
		{/each}
	</div>
	<div class="max-w-md">
		<Field.Group>
			<Field.Field>
				<Field.Label>Name</Field.Label>
				<Input bind:value={label} placeholder="Project" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Key</Field.Label>
				<Input bind:value={key} placeholder="project" />
				<Field.Description>Used in the spec. Leave blank to generate from the name.</Field.Description>
			</Field.Field>
			<Field.Field>
				<Field.Label>Where it lives</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={store}>
					<NativeSelect.Option value="local">This app only</NativeSelect.Option>
					<NativeSelect.Option value="directory">Shared across apps</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>
			<Button onclick={create}>Add</Button>
		</Field.Group>
	</div>
</div>
