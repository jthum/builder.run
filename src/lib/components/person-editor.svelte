<script lang="ts">
  import type { Permission } from "@jthum/framework/kernel";
  import { session } from "$lib/app/session.svelte.ts";
  import { serverRequest } from "$lib/app/remote.ts";
  import type { PeopleInfo, PersonAccess } from "$lib/app/access.ts";
  import type { AppSelection } from "$lib/framework/bootstrap.ts";
  import AccessSelect from "@jthum/framework/svelte/people/permission-select";
  import * as Dialog from "@jthum/framework/svelte/ui/dialog";
  import * as AlertDialog from "@jthum/framework/svelte/ui/alert-dialog";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Input } from "@jthum/framework/svelte/ui/input";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";
  import { toast } from "svelte-sonner";

  let { info, selection, editing = $bindable<PersonAccess | null | undefined>(undefined), onChanged }:
    { info: PeopleInfo; selection: AppSelection; editing?: PersonAccess | null; onChanged: () => void } = $props();
  let pending = $state(false);
  // undefined = closed, null = new user, otherwise an existing person.
  let name = $state("");
  let username = $state("");
  let password = $state("");
  let permissions = $state<readonly Permission[]>(["read"]);
  let apps = $state<{ appId: string; name: string; permissions: readonly Permission[] }[]>([]);
  let confirmation = $state<"remove" | "revokeSessions" | null>(null);
  const self = $derived(editing?.actor.id === session.actor?.id);

  $effect(() => {
    const person = editing;
    name = person?.actor.name ?? "";
    username = person?.username ?? "";
    password = "";
    permissions = [...(person?.permissions ?? ["read"])];
    apps = (info?.apps ?? []).map((app) => ({
      appId: app.id, name: app.name,
      permissions: [...(person ? person.apps.find((entry) => entry.appId === app.id)?.permissions ?? [] : app.id === session.app?.id ? ["read" as const] : [])],
    }));
    confirmation = null;
  });

  async function mutate(operation: string, input: Record<string, unknown>) {
    if (pending) return;
    pending = true;
    try {
      await serverRequest(`people.${operation}`, input, selection);
      editing = undefined; password = ""; confirmation = null;
      toast.success(operation === "create" ? "User added. Share their sign-in link and password privately." : operation === "remove" ? "Space access removed" : operation === "revokeSessions" ? "User signed out" : "Access updated");
      onChanged();
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

</script>

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
            <AccessSelect label="Space permissions" bind:permissions requireRead description="Viewer allows entry. Manager can create apps and manage the Space and its people." disabled={pending || self} />
            <Field.Separator />
            <Field.Set>
              <Field.Legend variant="label">App permissions</Field.Legend>
              <Field.Description>Viewer can read. Editor can work with records. Manager can also change definitions and access.</Field.Description>
              <Field.Group>
                {#each apps as app (app.appId)}<AccessSelect label={app.name} bind:permissions={app.permissions} requireRead disabled={pending || self} />{/each}
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
