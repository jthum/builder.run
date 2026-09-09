<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { addLabel, collectionLabel, recordTitle } from "$lib/app/labels.ts";
	import { applicableWorkflows, reverseRelations } from "$lib/app/relations.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import {
		implicitCreateFormKey,
		implicitEditFormKey,
		implicitViewKey,
	} from "$lib/runtime/defaults.ts";
	import { normalizeFilters } from "$lib/runtime/filters.ts";
	import { parseTypeRef } from "$lib/runtime/model.ts";
	import { projectRow, RECORD_ID_TOKEN } from "$lib/runtime/query.ts";
	import type { FieldDef, FormDef, RecordValue, TypeDef, ViewDef } from "$lib/runtime/model.ts";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import { toast } from "svelte-sonner";

	const typeKey = $derived(page.params.type ?? "");
	const id = $derived(page.params.id ?? "");
	const spec = $derived(session.snapshot?.spec);
	const type = $derived(spec?.types.find((item) => item.key === typeKey));
	const form = $derived(spec?.forms.find((item) => item.key === implicitEditFormKey(typeKey)));
	const related = $derived(spec && typeKey ? reverseRelations(spec, typeKey) : []);
	let record = $state<RecordValue | null>(null);
	let missing = $state(false);
	let editing = $state(false);
	let deleteOpen = $state(false);
	let relatedRows = $state<Record<string, Array<Record<string, unknown>>>>({});
	let display = $state<Record<string, unknown> | null>(null);
	let creating = $state<{
		type: TypeDef;
		field: FieldDef;
		form: FormDef | undefined;
	} | null>(null);

	const title = $derived(recordTitle(record, type));
	const recordActions = $derived(
		spec && type && record ? applicableWorkflows(spec, type.key, record) : [],
	);
	const lifecycleActions = $derived(
		type?.lifecycle && record
			? type.lifecycle.transitions.filter((transition) =>
					transition.from.includes(String(record?.[type.lifecycle?.field ?? ""] ?? "")),
				)
			: [],
	);

	$effect(() => {
		void session.revision;
		void id;
		missing = false;
		editing = false;
		void (async () => {
			try {
				const row = await runtime().getRecord(typeKey, id);
				record = row;
				missing = !row;
				if (row && type) {
					const projected = await projectRow(
						runtime().queryContext(),
						type,
						row,
						type.fields.map((field) =>
							field.type === "reference" ? `${field.key}.name` : field.key,
						),
					);
					for (const field of type.fields) {
						if (field.type !== "reference" || !row[field.key]) continue;
						const path = `${field.key}.name`;
						if (projected[path]) continue;
						const target = parseTypeRef(field.target || "").type;
						const related = target
							? await runtime().getRecord(target, String(row[field.key]))
							: null;
						projected[path] =
							related?.name ?? related?.title ?? related?.number ?? related?.email ?? null;
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
		void session.revision;
		void id;
		void (async () => {
			if (!spec || !record) return;
			try {
				const next: Record<string, Array<Record<string, unknown>>> = {};
				for (const rel of reverseRelations(spec, typeKey)) {
					const view = relatedViewFor(rel.type.key, rel.field.key);
					if (view && relatedViewIsContextual(view, rel.field.key)) {
						next[rel.type.key] = await runtime().queryView(view, undefined, { recordId: id });
						continue;
					}
					const rows = await runtime().listRecords(rel.type.key);
					const matched = rows.filter((row) => String(row[rel.field.key] ?? "") === id);
					if (view) {
						next[rel.type.key] = [];
						for (const row of matched) {
							next[rel.type.key].push(
								await projectRow(runtime().queryContext(), rel.type, row, view.fields),
							);
						}
					} else {
						next[rel.type.key] = matched;
					}
				}
				relatedRows = next;
			} catch (err) {
				console.warn("Couldn't load related records", err);
			}
		})();
	});

	function startRelatedCreate(rel: { type: TypeDef; field: FieldDef }) {
		creating = {
			type: rel.type,
			field: rel.field,
			form: spec?.forms.find((item) => item.key === implicitCreateFormKey(rel.type.key)),
		};
	}

	const createDefaults = $derived(creating ? { [creating.field.key]: id } : {});
	const createOmit = $derived(creating ? [creating.field.key] : []);

	async function invoke(flowKey: string, label: string) {
		await runtime().invoke(flowKey, { [typeKey]: id });
		toast.success(label);
	}

	async function applyTransition(transitionKey: string, label: string) {
		await runtime().transition(typeKey, id, transitionKey);
		toast.success(label);
	}

	async function remove() {
		await runtime().remove(typeKey, id);
		toast.success("Deleted");
		await goto(`/t/${typeKey}`);
	}

	function relatedViewFor(typeKeyRel: string, fieldKey?: string): ViewDef | undefined {
		const views = spec?.views.filter((item) => item.source === typeKeyRel) ?? [];
		if (fieldKey) {
			const contextual = views
				.filter((item) =>
					normalizeFilters(item.where).some(
						(clause) => clause.field === fieldKey && clause.value === RECORD_ID_TOKEN,
					),
				)
				.sort((left, right) => Number(Boolean(left.implicit)) - Number(Boolean(right.implicit)));
			if (contextual[0]) return contextual[0];
		}
		return views.find((item) => item.key === implicitViewKey(typeKeyRel)) ?? views[0];
	}

	function relatedViewIsContextual(view: ViewDef, fieldKey: string): boolean {
		return normalizeFilters(view.where).some(
			(clause) => clause.field === fieldKey && clause.value === RECORD_ID_TOKEN,
		);
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
						{relatedViewIsContextual(view, rel.field.key) ? view.label : collectionLabel(rel.type)}
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
