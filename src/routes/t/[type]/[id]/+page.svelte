<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { addLabel, collectionLabel, recordTitle } from "$lib/app/labels.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { runWorkflow } from "$lib/app/workflow-launch.ts";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import PageHeader from "@jthum/framework/svelte/studio/page-header";
	import RecordForm from "$lib/components/record-form.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import * as AlertDialog from "@jthum/framework/svelte/ui/alert-dialog";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Dialog from "@jthum/framework/svelte/ui/dialog";
	import * as DropdownMenu from "@jthum/framework/svelte/ui/dropdown-menu";
	import {
		implicitCreateFormKey,
		implicitEditFormKey,
		implicitViewKey,
	} from "$lib/runtime/defaults.ts";
	import type { CollectionDraft, FieldDraft, FormDraft, ViewDraft } from "@jthum/framework/svelte/studio/data";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import { toast } from "svelte-sonner";

	const typeKey = $derived(page.params.type ?? "");
	const id = $derived(page.params.id ?? "");
	const context = $derived(canonicalStudio.context);
	const type = $derived(context?.collections.find((item) => item.key === typeKey));
	const form = $derived(context?.forms.find((item) => item.key === implicitEditFormKey(typeKey)));
	const related = $derived(
		(context?.collections ?? []).flatMap((collection) =>
			collection.fields
				.filter((field) => field.type === "reference" && field.target === typeKey)
				.map((field) => ({ type: collection, field })),
		),
	);
	let record = $state<Record<string, unknown> | null>(null);
	let missing = $state(false);
	let editing = $state(false);
	let deleteOpen = $state(false);
	let relatedRows = $state<Record<string, Array<Record<string, unknown>>>>({});
	let display = $state<Record<string, unknown> | null>(null);
	let creating = $state<{
		type: CollectionDraft;
		field: FieldDraft;
		form: FormDraft | undefined;
	} | null>(null);

	const title = $derived(recordTitle(record, type));
	const recordActions = $derived(
		(context?.rules ?? []).filter(
			(rule) =>
				!rule.trigger &&
				rule.expose?.includes("ui") &&
				Object.values(rule.input ?? {}).some(
					(input) => "record" in input && input.record === typeKey,
				),
		),
	);
	const lifecycleActions = $derived(
		type?.lifecycle && record
			? type.lifecycle.transitions.filter((transition) =>
					transition.from.includes(String(record?.[type.lifecycle?.field ?? ""] ?? "")),
				)
			: [],
	);

	$effect(() => {
		void canonicalStudio.revision;
		void id;
		missing = false;
		editing = false;
		void (async () => {
			try {
				const row = await canonicalStudio.getRecord(typeKey, id);
				record = row;
				missing = !row;
				if (row && type) {
					const projected = { ...row };
					for (const field of type.fields) {
						if (field.type !== "reference" || !row[field.key]) continue;
						const path = `${field.key}.name`;
						const target = field.target ?? "";
						const linked = target
							? await canonicalStudio.getRecord(target, String(row[field.key]))
							: null;
						projected[path] =
							linked?.name ?? linked?.title ?? linked?.number ?? linked?.email ?? null;
					}
					display = projected;
				} else {
					display = row;
				}
			} catch (err) {
				console.warn("Couldn't load record", err);
			}
		})();
	});

	$effect(() => {
		void canonicalStudio.revision;
		void id;
		void (async () => {
			if (!context || !record) return;
			try {
				const next: Record<string, Array<Record<string, unknown>>> = {};
				for (const rel of related) {
					const view = relatedViewFor(rel.type.key, rel.field.key);
					if (view && isContextual(view)) {
						next[rel.type.key] = await canonicalStudio.queryViewWith(view.key, {
							record_id: id,
						});
						continue;
					}
					const rows = await canonicalStudio.listRecords(rel.type.key);
					const matched = rows.filter((row) => String(row[rel.field.key] ?? "") === id);
					next[rel.type.key] = matched;
				}
				relatedRows = next;
			} catch (err) {
				console.warn("Couldn't load related records", err);
			}
		})();
	});

	function startRelatedCreate(rel: { type: CollectionDraft; field: FieldDraft }) {
		creating = {
			type: rel.type,
			field: rel.field,
			form: context?.forms.find((item) => item.key === implicitCreateFormKey(rel.type.key)),
		};
	}

	const createDefaults = $derived(creating ? { [creating.field.key]: id } : {});
	const createOmit = $derived(creating ? [creating.field.key] : []);

	async function invoke(flowKey: string, label: string) {
		const rule = context?.rules.find((item) => item.key === flowKey);
		const inputName = Object.entries(rule?.input ?? {}).find(
			([, input]) => "record" in input && input.record === typeKey,
		)?.[0];
		await runWorkflow(flowKey, { [inputName ?? typeKey]: id }, label);
	}

	async function applyTransition(transitionKey: string, label: string) {
		const transition = type?.lifecycle?.transitions.find((item) => item.key === transitionKey);
		if (!type?.lifecycle || !transition) return;
		record = await canonicalStudio.updateRecord(typeKey, id, {
			[type.lifecycle.field]: transition.to,
		});
		toast.success(label);
	}

	async function remove() {
		await canonicalStudio.deleteRecord(typeKey, id);
		toast.success("Deleted");
		await goto(`/t/${typeKey}`);
	}

	function relatedViewFor(typeKeyRel: string, _fieldKey?: string): ViewDraft | undefined {
		const views = context?.views.filter((item) => item.source === typeKeyRel) ?? [];
		const contextual = views.find(isContextual);
		if (contextual) return contextual;
		return views.find((item) => item.key === implicitViewKey(typeKeyRel)) ?? views[0];
	}

	function isContextual(view: ViewDraft): boolean {
		return JSON.stringify(view.where ?? {}).includes("$record.id");
	}

	const updated = $derived(
		record?.updated_at
			? new Date(String(record.updated_at)).toLocaleString(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				})
			: null,
	);
</script>

{#if type && record}
	<div class="flex flex-col gap-8">
		<PageHeader {title} description={updated ? `Updated ${updated}` : undefined}>
			{#snippet actions()}
				{#each lifecycleActions as transition (transition.key)}
					<Button onclick={() => applyTransition(transition.key, transition.label)}>{transition.label}</Button>
				{/each}
				{#each recordActions as workflow (workflow.id)}
					<Button variant="outline" onclick={() => invoke(workflow.key, workflow.label)}>{workflow.label}</Button>
				{/each}
				{#if !editing}
					<Button variant="outline" onclick={() => (editing = true)}>
						<PencilIcon data-icon="inline-start" />
						Edit
					</Button>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" {...props}>
								<EllipsisIcon />
								<span class="sr-only">More</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-40">
						<DropdownMenu.Item variant="destructive" onSelect={() => (deleteOpen = true)}>
							Delete
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/snippet}
		</PageHeader>

		{#if editing}
			<Card.Root>
				<Card.Header>
					<Card.Title>Edit {type.label.toLowerCase()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<RecordForm
						{type}
						{record}
						{form}
						fields={form?.fields}
						onSaved={() => (editing = false)}
						onCancel={() => (editing = false)}
					/>
				</Card.Content>
			</Card.Root>
		{:else}
			<Card.Root>
				<Card.Content>
					<dl class="grid gap-6 sm:grid-cols-2">
						{#each type.fields as field (field.id)}
							{@const path = field.type === "reference" ? `${field.key}.name` : field.key}
							{@const target = field.type === "reference" ? String(record[field.key] ?? "") : ""}
							<div class="flex flex-col gap-1">
								<dt class="text-sm text-muted-foreground">{field.label}</dt>
								<dd>
									<FormattedValue
										{path}
										value={display?.[path] ?? record[field.key]}
										{type}
										badge={field.type === "enum"}
										href={field.type === "reference" && target
											? `/t/${field.target?.split(".").at(-1)}/${target}`
											: undefined}
									/>
								</dd>
							</div>
						{/each}
					</dl>
				</Card.Content>
			</Card.Root>
		{/if}

		{#each related as rel (rel.type.id + rel.field.id)}
			{@const view = relatedViewFor(rel.type.key, rel.field.key)}
			{#if view}
				<div class="flex flex-col gap-3">
					<h2 class="text-lg font-medium">
						{isContextual(view)
							? view.label
							: collectionLabel(rel.type)}
					</h2>
					<RecordTable
						rows={relatedRows[rel.type.key] ?? []}
						{view}
						typeKey={rel.type.key}
						createLabel={addLabel(rel.type)}
						compact
						onCreate={() => startRelatedCreate(rel)}
					/>
				</div>
			{/if}
		{/each}
	</div>
	<Dialog.Root
		open={Boolean(creating)}
		onOpenChange={(open) => {
			if (!open) creating = null;
		}}
	>
		{#if creating}
			<Dialog.Content
				class="max-h-[min(44rem,calc(100vh-2rem))] overflow-hidden sm:max-w-lg"
				data-testid="related-create"
			>
				<Dialog.Header>
					<Dialog.Title>{addLabel(creating.type)}</Dialog.Title>
					<Dialog.Description>This will be added to {title}.</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body class="overflow-y-auto">
					<RecordForm
						type={creating.type}
						form={creating.form}
						fields={creating.form?.fields}
						defaults={createDefaults}
						omit={createOmit}
						onSaved={() => {
							const label = creating?.type.label ?? "Record";
							creating = null;
							toast.success(`${label} added`);
						}}
						onCancel={() => (creating = null)}
					/>
				</Dialog.Body>
			</Dialog.Content>
		{/if}
	</Dialog.Root>
	<AlertDialog.Root bind:open={deleteOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Delete {title}?</AlertDialog.Title>
				<AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{:else if missing}
	<p class="text-muted-foreground">This record is gone, or the link is wrong.</p>
{/if}
