<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { addLabel, collectionLabel, recordTitle } from "$lib/app/labels.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { runWorkflow } from "$lib/app/workflow-launch.ts";
	import RecordDetails from "$lib/components/record-details.svelte";
	import { RecordLoader } from "$lib/app/record-loader.svelte.ts";
	import { untrack } from "svelte";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
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
	import type { CollectionDraft, FieldDraft, FormDraft, ViewDraft } from "@jthum/framework/svelte/authoring/data";
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
	const detailsLoader = new RecordLoader();
	const record = $derived(detailsLoader.record);
	let retry = $state(0);
	let editing = $state(false);
	let deleteOpen = $state(false);
	let relatedRows = $state<Record<string, Array<Record<string, unknown>>>>({});
	let relatedError = $state(false);
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
		void retry;
		const collection = type;
		const recordId = id;
		const collections = context?.collections ?? [];
		editing = false;
		if (collection) untrack(() => { void detailsLoader.load(collection, recordId, canonicalStudio.recordReader(), collections); });
		return () => detailsLoader.cancel();
	});

	$effect(() => {
		void canonicalStudio.revision;
		const recordId = id;
		const currentRecord = record;
		const relations = related;
		let cancelled = false;
		relatedRows = {};
		relatedError = false;
		void (async () => {
			if (!context || !currentRecord) return;
			try {
				const next: Record<string, Array<Record<string, unknown>>> = {};
				for (const rel of relations) {
					if (cancelled) return;
					const view = relatedViewFor(rel.type.key, rel.field.key);
					if (view) next[rel.field.id] = await canonicalStudio.queryRelatedRecords(view, rel.field.key, recordId);
				}
				if (!cancelled) relatedRows = next;
			} catch (err) {
				if (!cancelled) relatedError = true;
				console.warn("Couldn't load related records", err);
			}
		})();
		return () => { cancelled = true; };
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
		await canonicalStudio.updateRecord(typeKey, id, {
			[type.lifecycle.field]: transition.to,
		});
		toast.success(label);
	}

	async function remove() {
		await canonicalStudio.deleteRecord(typeKey, id);
		toast.success("Deleted");
		await goto(`/t/${typeKey}`);
	}

	function relatedViewFor(typeKeyRel: string, fieldKey?: string): ViewDraft | undefined {
		const views = context?.views.filter((item) => item.source === typeKeyRel) ?? [];
		const contextual = views.find((view) => Array.isArray(view.where) && view.where.some((clause) => clause.field === fieldKey && clause.value === "$record.id"));
		if (contextual) return contextual;
		return views.find((item) => item.key === implicitViewKey(typeKeyRel)) ?? views[0];
	}

	function isContextual(view: ViewDraft): boolean {
		return JSON.stringify(view.where ?? {}).includes("$record.id");
	}

</script>

{#if type && record}
	<div class="flex flex-col gap-8">
		<RecordDetails {type} {record} references={detailsLoader.references} showProperties={!editing}>
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
		</RecordDetails>

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
					{#if relatedError}<p class="text-sm text-muted-foreground">Couldn't load related records. <button class="underline underline-offset-4" onclick={() => retry++}>Try again</button></p>{:else}
					<RecordTable
						rows={relatedRows[rel.field.id] ?? null}
						{view}
						typeKey={rel.type.key}
						createLabel={addLabel(rel.type)}
						compact
						onCreate={() => startRelatedCreate(rel)}
					/>
					{/if}
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
{:else if detailsLoader.loading}
	<div class="flex flex-col gap-6" role="status" aria-label="Loading record"><Skeleton class="h-10 w-1/2" /><Skeleton class="h-48 w-full" /></div>
{:else if detailsLoader.error}
	<Empty.Root><Empty.Header><Empty.Title>Couldn't open record</Empty.Title><Empty.Description>{detailsLoader.error}</Empty.Description></Empty.Header><Empty.Content><Button variant="outline" onclick={() => retry++}>Try again</Button></Empty.Content></Empty.Root>
{:else}
	<Empty.Root><Empty.Header><Empty.Title>Record unavailable</Empty.Title><Empty.Description>It may have been removed, or you may not have access.</Empty.Description></Empty.Header></Empty.Root>
{/if}
