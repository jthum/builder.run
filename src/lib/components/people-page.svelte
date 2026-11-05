<script lang="ts">
  import { session } from "$lib/app/session.svelte.ts";
  import { SERVER_MODE } from "$lib/app/deployment.ts";
  import { serverRequest } from "$lib/app/remote.ts";
  import type { PeopleInfo, PersonAccess } from "$lib/app/access.ts";
  import type { AppSelection } from "$lib/framework/bootstrap.ts";
  import type { MemberQuery } from "@jthum/framework/client";
  import PeopleTable from "@jthum/framework/svelte/people/people-table";
  import PeopleFilters from "@jthum/framework/svelte/people/people-filters";
  import PersonEditor from "./person-editor.svelte";
  import { initialsFromName, toneFromName } from "$lib/app/color.ts";
  import { PageHeader } from "@jthum/framework/svelte/ui/page-header";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { OptionSelect } from "@jthum/framework/svelte/ui/option-select";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import * as Avatar from "@jthum/framework/svelte/ui/avatar";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import LinkIcon from "@lucide/svelte/icons/link";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { toast } from "svelte-sonner";

  let { selection }: { selection: AppSelection } = $props();
  let query = $state<MemberQuery>({ limit: 25, offset: 0 });
  let info = $state<PeopleInfo | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let revision = $state(0);
  let editing = $state<PersonAccess | null | undefined>(undefined);
  const id = $props.id();

  $effect(() => {
    const input = { ...query };
    const target = { ...selection };
    const client = session.framework?.spaceClient;
    void revision;
    let current = true;
    loading = true;
    error = null;
    const timer = setTimeout(() => {
      const request = SERVER_MODE
        ? serverRequest("people.list", input, target)
        : client!.queryMembers(input).then((page): PeopleInfo => ({
            people: page.members.map(({ actor, membership }) => ({ actor, permissions: membership.permissions, roles: membership.roles, apps: [] })),
            total: page.total, limit: page.limit, offset: page.offset, apps: [], signInUrl: "",
          }));
      void request.then((value) => {
        if (!current) return;
        const page = value as PeopleInfo;
        // A removal or permission filter can empty the last page. Re-query a valid page.
        if (page.offset > 0 && !page.people.length) {
          query = { ...input, offset: Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit };
          return;
        }
        info = page;
      }).catch((cause) => {
        if (current) { error = cause instanceof Error ? cause.message : "Could not load people."; info = null; }
      }).finally(() => { if (current) loading = false; });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  });

  async function copyLink() {
    if (!info) return;
    try { await navigator.clipboard.writeText(new URL(info.signInUrl, location.origin).href); toast.success("Space sign-in link copied"); }
    catch { toast.error("Could not copy the link. Try again from a secure connection."); }
  }

  function manage(person: PersonAccess) { editing = person; }
</script>

<div class="flex flex-col gap-6">
  <PageHeader title="People and access" description={`Manage who can use ${session.space?.name ?? "this Space"} and its apps.`}>
    {#snippet actions()}
      {#if SERVER_MODE}
      <Button variant="outline" disabled={!info || loading} onclick={copyLink}><LinkIcon data-icon="inline-start" />Copy sign-in link</Button>
      <Button disabled={!info?.apps.length || loading} onclick={() => (editing = null)}><PlusIcon data-icon="inline-start" />Add user</Button>
      {/if}
    {/snippet}
  </PageHeader>

  <PeopleFilters {query} onChange={(next) => (query = next)}>
    {#if SERVER_MODE}
    <Field.Field class="w-auto"><Field.Label class="sr-only" for={`${id}-app`}>Filter App access</Field.Label><OptionSelect id={`${id}-app`} value={query.memberOf ?? ""} options={[{ value: "", label: "All apps" }, ...(info?.apps ?? []).map((app) => ({ value: app.id, label: app.name }))]} onValueChange={(value) => (query = { ...query, memberOf: value || undefined, offset: 0 })} /></Field.Field>
    {/if}
  </PeopleFilters>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Title>Could not load people</Alert.Title><Alert.Description>{error}</Alert.Description><Button variant="outline" onclick={() => revision++}><RefreshCwIcon data-icon="inline-start" />Try again</Button></Alert.Root>
  {:else}
    <PeopleTable people={info?.people ?? []} total={info?.total ?? 0} offset={info?.offset ?? 0} limit={info?.limit ?? query.limit ?? 25} {loading} selfId={session.actor?.id} accessHeading="Space access" detailLabel={SERVER_MODE ? "App access" : "Roles"} onPageChange={(offset) => (query = { ...query, offset })} onLimitChange={(limit) => (query = { ...query, limit, offset: 0 })} onManage={SERVER_MODE ? manage : undefined} canManage={(person) => person.actor.id !== session.actor?.id}>
      {#snippet avatar(person)}
        {@const tone = toneFromName(person.actor.name)}
        <Avatar.Root><Avatar.Fallback style={`background-color: ${tone.background}; color: ${tone.foreground}`}>{initialsFromName(person.actor.name)}</Avatar.Fallback></Avatar.Root>
      {/snippet}
      {#snippet secondary(person)}{SERVER_MODE ? person.username ?? "No local login" : person.actor.email ?? person.actor.kind}{/snippet}
      {#snippet detail(person)}
        {@const count = person.apps.filter((app) => app.permissions.includes("read")).length}
        <span class="text-sm text-muted-foreground">{SERVER_MODE ? count === 0 ? "No apps" : `${count} ${count === 1 ? "app" : "apps"}` : person.roles?.join(", ") || "—"}</span>
      {/snippet}
    </PeopleTable>
  {/if}
  <p class="text-sm text-muted-foreground">{SERVER_MODE ? "Space and App access are assigned separately. Only apps you manage are shown. Removing access preserves the person's records and history." : "This is your local Space directory. Shared logins and access management are available in server-side deployments."}</p>
</div>

{#if SERVER_MODE && info}<PersonEditor {info} {selection} bind:editing onChanged={() => revision++} />{/if}
