<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { session } from "$lib/app/session.svelte.ts";
  import { installApprovalExample } from "$lib/framework/approval-example.ts";
  import { ExecutionInspector, ExecutionList, RuleLauncher, RuleEditor, ruleDraftFromDefinition, ruleDefinitionFromDraft, PageHeader, OptionSelect } from "@jthum/framework/svelte/studio";
  import type { RuleDraft, EditorContext } from "@jthum/framework/svelte/studio";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";
  import type { ActorRequest, RuleExecutionDetails, RuleExecutionSummary } from "@jthum/framework/kernel";
  import type { RuleDefinition, Spec } from "@jthum/framework/spec";

  const client = $derived(session.framework?.appClient);
  const runId = $derived(page.url.searchParams.get("run"));
  let rules = $state.raw<readonly RuleDefinition[]>([]);
  let executions = $state.raw<readonly RuleExecutionSummary[]>([]);
  let execution = $state.raw<RuleExecutionDetails | null>(null);
  let requests = $state.raw<readonly ActorRequest[]>([]);
  let selectedKey = $state("");
  let workspaceName = $state("");
  let actorName = $state<string | undefined>();
  let error = $state("");
  let pending = $state(false);
  let historyPage = $state(0);
  let hasMore = $state(false);
  let generation = 0;
  let editing = $state(false);
  let canonicalSpec = $state.raw<Spec | null>(null);
  const selected = $derived(rules.find(rule => rule.key === selectedKey));
  const context = $derived<EditorContext>({ collections: [], views: [], forms: [], rules: canonicalSpec ? rules.map(rule => ruleDraftFromDefinition(rule, canonicalSpec!)) : [] });
  const limit = 20;

  async function refresh() {
    if (!client) return;
    const active = client;
    const token = ++generation;
    const id = runId;
    const offset = historyPage * limit;
    pending = true; error = "";
    try {
      const [workspace, history, details, assigned] = await Promise.all([
        active.getWorkspace(), active.listRuleExecutions(limit + 1, offset),
        id ? active.getRuleExecutionDetails(id) : Promise.resolve(null),
        id ? active.listActorRequests(id) : Promise.resolve([]),
      ]);
      if (token !== generation || active !== client) return;
      workspaceName = workspace.name;
      canonicalSpec = workspace.spec;
      rules = workspace.spec.rules;
      executions = history.slice(0, limit);
      hasMore = history.length > limit;
      execution = details; requests = assigned;
      const framework = session.framework;
      if (details && framework) {
        const actor = await framework.kernel.getActor(framework.appContext, details.actorId);
        if (token === generation) actorName = actor?.name;
      }
      if (id && !details) error = "This run was not found in this Framework workspace.";
    } catch (cause) {
      if (token === generation) error = cause instanceof Error ? cause.message : "Unable to load workflow runs.";
    } finally { if (token === generation) pending = false; }
  }
  $effect(() => { void client; void runId; void historyPage; void refresh(); });
  async function selectRun(run: { readonly id: string }) {
    const url = new URL(page.url.href);
    url.searchParams.set("run", run.id);
    await goto(url.pathname + url.search, { reset: false });
  }
  async function closeRun() {
    const url = new URL(page.url.href);
    url.searchParams.delete("run");
    await goto(url.pathname + url.search, { reset: false });
  }
  async function example() {
    if (!client || pending) return;
    pending = true; error = "";
    try {
      const rule = await installApprovalExample(client);
      selectedKey = rule.key;
      await closeRun();
      await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : "Unable to install the example."; }
    finally { pending = false; }
  }
  async function saveRule(draft: RuleDraft) {
    if (!client) throw new Error("The runtime is not open.");
    const workspace = await client.getWorkspace();
    const rule = ruleDefinitionFromDraft(draft, workspace.spec);
    await client.applySpec({ ...workspace.spec, rules: workspace.spec.rules.map(item => item.id === rule.id ? rule : item) });
    editing = false;
    await refresh();
  }
  async function removeRule(key: string) {
    if (!client) throw new Error("The runtime is not open.");
    const workspace = await client.getWorkspace();
    await client.applySpec({ ...workspace.spec, rules: workspace.spec.rules.filter(rule => rule.key !== key) });
    editing = false; selectedKey = ""; await refresh();
  }
</script>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
  <PageHeader title="Workflow runs" description={workspaceName ? `Durable workflows in ${workspaceName}.` : "Inspect runs and respond to workflow requests."}>
    {#snippet actions()}<Button variant="outline" href="/build/automations">Automations</Button>{/snippet}
  </PageHeader>
  <Alert.Root><Alert.Title>Workflow runs</Alert.Title><Alert.Description>Runs use this App's records and workflows. The optional approval example is independent and does not modify business records.</Alert.Description></Alert.Root>
  {#if error}<Alert.Root variant="destructive"><Alert.Title>Unable to load or update runs</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
  {#if client}
    {#if runId}
      <div><Button variant="outline" onclick={closeRun}>Back to your runs</Button></div>
      {#if execution && execution.id === runId}
        {#key execution.id}<ExecutionInspector {execution} {requests} {client} onChange={refresh} {actorName} />{/key}
      {:else if pending}<p class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Loading run…</p>{/if}
    {:else}
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-48 flex-1"><OptionSelect bind:value={selectedKey} options={rules.map(rule => ({ value: rule.key, label: rule.label }))} placeholder="Choose a workflow to run" disabled={pending} /></div>
        <Button variant="outline" disabled={pending} onclick={example}>Try approval example</Button>
        <Button variant="outline" disabled={pending} onclick={refresh}>Refresh</Button>
      </div>
      {#if selected && canonicalSpec}
        {#if selected.meta?.example === "durable_approval"}<div class="flex gap-2"><Button variant="outline" onclick={() => editing = !editing}>{editing ? "Close editor" : "Edit preview workflow"}</Button></div>{/if}
        {#if editing && selected.meta?.example === "durable_approval"}
          <Alert.Root><Alert.Title>Workflow authoring</Alert.Title><Alert.Description>Edits affect future runs only; existing runs retain their saved workflow and execution context.</Alert.Description></Alert.Root>
          {#key selected.id}<RuleEditor rule={ruleDraftFromDefinition(selected, canonicalSpec)} {context} actorRequests actions={{ save: saveRule, remove: removeRule }} onDeleted={refresh} />{/key}
        {:else}{#key selected.id}<RuleLauncher rule={selected} {client} onStarted={selectRun} />{/key}{/if}
      {/if}
      <ExecutionList {executions} {hasMore} {pending} page={historyPage} onPage={next => historyPage = next} onSelect={selectRun} />
    {/if}
  {:else}<p class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Opening the runtime…</p>{/if}
</div>
