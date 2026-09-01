<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as NativeSelect from "$lib/components/ui/native-select/index.js";
	import { slugify } from "$lib/runtime/ids.ts";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.snapshot?.spec);
	const pages = $derived(spec?.pages ?? []);
	const views = $derived(spec?.views ?? []);
	const forms = $derived(spec?.forms ?? []);
	const flows = $derived(spec?.flows ?? []);

	let key = $state("");
	let label = $state("");
	let kind = $state<"view" | "form" | "action" | "text">("view");
	let target = $state("");
	let text = $state("");

	$effect(() => {
		if (kind === "view" && views[0] && !views.some((item) => item.key === target)) target = views[0].key;
		if (kind === "form" && forms[0] && !forms.some((item) => item.key === target)) target = forms[0].key;
		if (kind === "action" && flows[0] && !flows.some((item) => item.key === target)) target = flows[0].key;
	});

	async function create() {
		const block: PageBlock =
			kind === "text"
				? { kind: "text", text }
				: kind === "view"
					? { kind: "view", view: target }
					: kind === "form"
						? { kind: "form", form: target }
						: { kind: "action", flow: target };
		await runtime().upsertPage({
			key: key || slugify(label),
			label,
			blocks: [block],
		});
		key = "";
		label = "";
		text = "";
		toast.success("Page saved");
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Pages</h1>
		<p class="text-muted-foreground">Compose views, forms, actions, and text. Defaults already cover type pages.</p>
	</div>
	<div class="flex flex-col gap-2">
		{#each pages as page (page.id)}
			<a class="rounded-lg border px-3 py-2 hover:bg-muted/50" href="/p/{page.key}">
				<div class="font-medium">{page.label}</div>
				<div class="text-sm text-muted-foreground">{page.key}{page.implicit ? " · default" : ""}</div>
			</a>
		{/each}
	</div>
	<div class="max-w-xl">
		<Field.Group>
			<Field.Field>
				<Field.Label>Label</Field.Label>
				<Input bind:value={label} placeholder="Dashboard" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Key</Field.Label>
				<Input bind:value={key} placeholder="dashboard" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Block</Field.Label>
				<NativeSelect.Root class="w-full" bind:value={kind}>
					<NativeSelect.Option value="view">View</NativeSelect.Option>
					<NativeSelect.Option value="form">Form</NativeSelect.Option>
					<NativeSelect.Option value="action">Action</NativeSelect.Option>
					<NativeSelect.Option value="text">Text</NativeSelect.Option>
				</NativeSelect.Root>
			</Field.Field>
			{#if kind === "text"}
				<Field.Field>
					<Field.Label>Text</Field.Label>
					<Input bind:value={text} />
				</Field.Field>
			{:else}
				<Field.Field>
					<Field.Label>Target</Field.Label>
					<NativeSelect.Root class="w-full" bind:value={target}>
						{#if kind === "view"}
							{#each views as view (view.id)}
								<NativeSelect.Option value={view.key}>{view.label}</NativeSelect.Option>
							{/each}
						{:else if kind === "form"}
							{#each forms as form (form.id)}
								<NativeSelect.Option value={form.key}>{form.label}</NativeSelect.Option>
							{/each}
						{:else}
							{#each flows as flow (flow.id)}
								<NativeSelect.Option value={flow.key}>{flow.label}</NativeSelect.Option>
							{/each}
						{/if}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<Button onclick={create}>Create page</Button>
		</Field.Group>
	</div>
</div>
