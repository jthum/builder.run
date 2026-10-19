<script lang="ts">
  import type { Permission } from "@jthum/framework/kernel";
  import { session } from "$lib/app/session.svelte.ts";
  import { serverRequest } from "$lib/app/remote.ts";
  import { ACCESS_PRESETS, accessPreset, type PeopleInfo, type PersonAccess } from "$lib/app/access.ts";
  import { initialsFromName, toneFromName } from "$lib/app/color.ts";
  import AccessSelect from "$lib/components/access-select.svelte";
  import * as Dialog from "@jthum/framework/svelte/ui/dialog";
  import * as AlertDialog from "@jthum/framework/svelte/ui/alert-dialog";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import * as Avatar from "@jthum/framework/svelte/ui/avatar";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import { Badge } from "@jthum/framework/svelte/ui/badge";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Input } from "@jthum/framework/svelte/ui/input";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import LinkIcon from "@lucide/svelte/icons/link";
  import { toast } from "svelte-sonner";

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let info = $state<PeopleInfo | null>(null);
  let error = $state<string | null>(null);
  let pending = $state(false);
  let loading = $state(false);
  // undefined = closed, null = new user, otherwise an existing person.
  let editing = $state<PersonAccess | null | undefined>(undefined);
  let name = $state("");
  let username = $state("");
  let password = $state("");
  let permissions = $state<readonly Permission[]>(["read"]);
  let apps = $state<{ appId: string; name: string; permissions: readonly Permission[] }[]>([]);
  let confirmation = $state<"remove" | "revokeSessions" | null>(null);
  let generation = 0;
  const canManage = $derived(session.permissions.space.includes("manage"));
  const self = $derived(editing?.actor.id === session.actor?.id);

  $effect(() => {
    const selection = session.framework?.selection;
    const visible = open;
    if (!visible || !selection || !canManage) {
      info = null; editing = undefined; password = ""; confirmation = null;
      return;
    }
    const version = ++generation;
    loading = true;
    error = null;
    void serverRequest("people.list", {}, selection).then((value) => {
      if (generation === version) info = value as PeopleInfo;
    }).catch((cause) => {
      if (generation === version) error = cause instanceof Error ? cause.message : "Could not load people.";
    }).finally(() => { if (generation === version) loading = false; });
    return () => { generation += 1; };
  });

  function edit(person: PersonAccess | null) {
    name = person?.actor.name ?? "";
    username = person?.username ?? "";
    password = "";
    permissions = [...(person?.permissions ?? ["read"])];
    apps = (info?.apps ?? []).map((app) => ({
      appId: app.id, name: app.name,
      permissions: [...(person ? person.apps.find((entry) => entry.appId === app.id)?.permissions ?? [] : app.id === session.app?.id ? ["read" as const] : [])],
    }));
    editing = person;
    confirmation = null;
  }

  async function mutate(operation: string, input: Record<string, unknown>) {
    if (pending) return;
    pending = true;
    try {
      const selection = session.framework?.selection;
      const result = await serverRequest(`people.${operation}`, input, selection) as PeopleInfo;
      if (session.space?.id === selection?.spaceId) info = result;
      editing = undefined; password = ""; confirmation = null;
      toast.success(operation === "create" ? "User added. Share their sign-in link and password privately." : operation === "remove" ? "Space access removed" : operation === "revokeSessions" ? "User signed out" : "Access updated");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not update access."); }
    finally { pending = false; }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (editing === undefined || self) return;
    await mutate(editing ? "update" : "create", {
      ...(editing ? { actorId: editing.actor.id } : { name, username, password }),
      permissions, apps: apps.map(({ appId, permissions }) => ({ appId, permissions })),
    });
  }

  function closeEditor(value: boolean) {
    if (!value && !pending) { editing = undefined; password = ""; confirmation = null; }
  }

  async function copyLink() {
    if (!info) return;
    try { await navigator.clipboard.writeText(new URL(info.signInUrl, location.origin).href); toast.success("Space sign-in link copied"); }
    catch { toast.error("Could not copy the link. Try again from a secure connection."); }
  }

  function accessLabel(value: readonly Permission[]) {
    return ACCESS_PRESETS.find((preset) => preset.value === accessPreset(value))?.label ?? "Custom access";
  }
</script>

<Dialog.Root {open} onOpenChange={(value) => { if (!pending) open = value; }}>
  <Dialog.Content class="max-h-[calc(100svh-2rem)] sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>People and access</Dialog.Title>
      <Dialog.Description>Choose who can use {session.space?.name} and its apps.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Body class="overflow-y-auto">
      {#if error}
        <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
      {:else if loading || !info}
        <div class="flex items-center justify-center gap-2 p-8"><Spinner />Loading people</div>
      {:else}
        <ul class="flex flex-col divide-y divide-border/60">
          {#each info.people as person (person.actor.id)}
            {@const tone = toneFromName(person.actor.name)}
            {@const isSelf = person.actor.id === session.actor?.id}
            <li class="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
              <Avatar.Root>
                <Avatar.Fallback style={`background-color: ${tone.background}; color: ${tone.foreground}`}>{initialsFromName(person.actor.name)}</Avatar.Fallback>
              </Avatar.Root>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{person.actor.name}{isSelf ? " (you)" : ""}</p>
                <p class="truncate text-sm text-muted-foreground">{person.username ?? "No local login"} · {person.apps.filter((app) => app.permissions.includes("read")).length} apps</p>
              </div>
              <Badge variant={person.permissions.includes("manage") ? "default" : "outline"}>{accessLabel(person.permissions)}</Badge>
              <Button type="button" variant="outline" size="sm" disabled={pending || isSelf} onclick={() => edit(person)} aria-label={`Manage access for ${person.actor.name}`}>Manage</Button>
            </li>
          {/each}
        </ul>
        <p class="mt-5 text-sm text-muted-foreground">App access is assigned separately. Only apps you manage are shown. Removing access keeps the person's messages and history.</p>
      {/if}
    </Dialog.Body>
    <Dialog.Footer>
      <Button type="button" variant="ghost" disabled={!info || pending} onclick={copyLink}><LinkIcon data-icon="inline-start" />Copy sign-in link</Button>
      <Button type="button" variant="outline" disabled={pending} onclick={() => (open = false)}>Done</Button>
      <Button type="button" disabled={!info || pending || !info.apps.length} onclick={() => edit(null)}><PlusIcon data-icon="inline-start" />Add user</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={editing !== undefined} onOpenChange={closeEditor}>
  <Dialog.Content class="max-h-[calc(100svh-2rem)] sm:max-w-lg">
    <form onsubmit={submit}>
      <Dialog.Header>
        <Dialog.Title>{editing ? editing.actor.name : "Add user"}</Dialog.Title>
        <Dialog.Description>{editing ? "Manage this person's access to the Space and its apps." : "Create a login for this Space. They can change their password in Profile settings."}</Dialog.Description>
      </Dialog.Header>
      <Dialog.Body class="overflow-y-auto">
        <Field.Group>
          {#if editing === null}
            <Field.Field><Field.Label for="person-name">Name</Field.Label><Input id="person-name" bind:value={name} autocomplete="name" required disabled={pending} /></Field.Field>
            <Field.Field><Field.Label for="person-username">Username</Field.Label><Input id="person-username" bind:value={username} autocomplete="off" autocapitalize="none" spellcheck={false} maxlength={128} required disabled={pending} /></Field.Field>
            <Field.Field><Field.Label for="person-password">Initial password</Field.Label><Input id="person-password" type="password" bind:value={password} autocomplete="new-password" minlength={12} maxlength={1024} required disabled={pending} /><Field.Description>At least 12 characters. Share it privately with the user.</Field.Description></Field.Field>
          {/if}
          {#key editing?.actor.id ?? "new"}
            <AccessSelect label="Space permissions" bind:permissions description="Viewer allows entry. Manager can create apps and manage the Space and its people." disabled={pending || self} />
            <Field.Separator />
            <Field.Set>
              <Field.Legend variant="label">App permissions</Field.Legend>
              <Field.Description>Viewer can read. Editor can work with records. Manager can also change definitions and access.</Field.Description>
              <Field.Group>
                {#each apps as app (app.appId)}<AccessSelect label={app.name} bind:permissions={app.permissions} disabled={pending || self} />{/each}
              </Field.Group>
            </Field.Set>
          {/key}
          {#if editing && !self}
            <Field.Separator />
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={pending || !editing.username} onclick={() => (confirmation = "revokeSessions")}>Sign out all sessions</Button>
              <Button type="button" variant="destructive" disabled={pending || !editing.permissions.length} onclick={() => (confirmation = "remove")}>Remove Space access</Button>
            </div>
          {/if}
        </Field.Group>
      </Dialog.Body>
      <Dialog.Footer>
        <Button type="button" variant="outline" disabled={pending} onclick={() => closeEditor(false)}>Cancel</Button>
        <Button type="submit" disabled={pending || self}>{#if pending}<Spinner data-icon="inline-start" />{/if}{editing ? "Save access" : "Create user"}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={confirmation !== null} onOpenChange={(value) => { if (!value && !pending) confirmation = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{confirmation === "remove" ? `Remove ${editing?.actor.name}'s access?` : `Sign ${editing?.actor.name} out?`}</AlertDialog.Title>
      <AlertDialog.Description>{confirmation === "remove" ? "They will lose access to this Space and all of its apps. Their records and history will remain. You can restore access later." : "All sessions for their Space login will end. They can sign in again with their existing password."}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={pending}>Cancel</AlertDialog.Cancel>
      <Button type="button" variant="destructive" disabled={pending} onclick={() => { if (confirmation && editing) void mutate(confirmation, { actorId: editing.actor.id }); }}>{#if pending}<Spinner data-icon="inline-start" />{/if}{confirmation === "remove" ? "Remove access" : "Sign out"}</Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
