<script lang="ts">
  import { onMount } from "svelte";
  import { serverRequest } from "$lib/app/remote.ts";
  import type { SecurityInfo } from "$lib/app/access.ts";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import * as AlertDialog from "@jthum/framework/svelte/ui/alert-dialog";
  import { Badge } from "@jthum/framework/svelte/ui/badge";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Input } from "@jthum/framework/svelte/ui/input";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";
  import { toast } from "svelte-sonner";

  let info = $state<SecurityInfo | null>(null);
  let error = $state<string | null>(null);
  let currentPassword = $state("");
  let password = $state("");
  let confirmation = $state("");
  let { pending = $bindable(false) }: { pending?: boolean } = $props();
  let confirmSignOut = $state(false);

  onMount(() => {
    let mounted = true;
    void serverRequest("security.get").then((value) => { if (mounted) info = value as SecurityInfo; })
      .catch((cause) => { if (mounted) error = cause instanceof Error ? cause.message : "Could not load security settings."; });
    return () => { mounted = false; };
  });

  export async function changePassword(): Promise<void> {
    if (pending || !info) return;
    if (password !== confirmation) { toast.error("The new passwords do not match."); return; }
    if (!currentPassword || password.length < 12) { toast.error("Enter your current password and a new password of at least 12 characters."); return; }
    pending = true;
    try {
      info = await serverRequest("security.password", { currentPassword, password }) as SecurityInfo;
      currentPassword = ""; password = ""; confirmation = "";
      toast.success("Password changed. Your other sessions have been signed out.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not change your password."); }
    finally { pending = false; }
  }

  async function revoke(sessionId?: string) {
    if (pending) return;
    pending = true;
    try {
      info = await serverRequest("security.revoke", sessionId ? { sessionId } : {}) as SecurityInfo;
      confirmSignOut = false;
      toast.success(sessionId ? "Session signed out" : "Other sessions signed out");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not sign out sessions."); }
    finally { pending = false; }
  }
</script>

{#if error}
  <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
{:else if !info}
  <div class="flex items-center gap-2"><Spinner />Loading security settings</div>
{:else}
  <Field.Group>
    <Field.Set>
      <Field.Legend>Change password</Field.Legend>
      <Field.Description>Signed in as {info.username}. Changing your password also signs out your other sessions.</Field.Description>
      <Field.Group>
        <Field.Field data-disabled={pending}>
          <Field.Label for="current-password">Current password</Field.Label>
          <Input id="current-password" type="password" bind:value={currentPassword} autocomplete="current-password" required maxlength={1024} disabled={pending} />
        </Field.Field>
        <Field.Field data-disabled={pending}>
          <Field.Label for="new-password">New password</Field.Label>
          <Input id="new-password" type="password" bind:value={password} autocomplete="new-password" required minlength={12} maxlength={1024} disabled={pending} />
          <Field.Description>At least 12 characters.</Field.Description>
        </Field.Field>
        <Field.Field data-disabled={pending} data-invalid={Boolean(confirmation && confirmation !== password)}>
          <Field.Label for="confirm-password">Confirm new password</Field.Label>
          <Input id="confirm-password" type="password" bind:value={confirmation} autocomplete="new-password" required maxlength={1024} disabled={pending} aria-invalid={Boolean(confirmation && confirmation !== password)} />
          {#if confirmation && confirmation !== password}<Field.Error>The new passwords do not match.</Field.Error>{/if}
        </Field.Field>
      </Field.Group>
    </Field.Set>
    <Field.Separator />
    <Field.Set>
      <Field.Legend>Active sessions</Field.Legend>
      <Field.Description>Sign out sessions you no longer use. Your current session will stay signed in.</Field.Description>
      <ul class="flex flex-col gap-3">
        {#each info.sessions as item (item.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
            <div class="flex flex-col gap-1">
              <p class="text-sm">Signed in {new Date(item.createdAt).toLocaleString()}</p>
              <p class="text-xs text-muted-foreground">Expires {new Date(item.expiresAt).toLocaleDateString()}</p>
            </div>
            {#if item.current}<Badge variant="outline">This session</Badge>
            {:else}<Button type="button" size="sm" variant="outline" disabled={pending} onclick={() => revoke(item.id)}>Sign out</Button>{/if}
          </li>
        {/each}
      </ul>
      <Button type="button" variant="outline" class="w-fit" disabled={pending || info.sessions.length < 2} onclick={() => (confirmSignOut = true)}>Sign out other sessions</Button>
    </Field.Set>
  </Field.Group>
{/if}

<AlertDialog.Root bind:open={confirmSignOut}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Sign out your other sessions?</AlertDialog.Title>
      <AlertDialog.Description>They will need to sign in again. This session will stay signed in.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={pending}>Cancel</AlertDialog.Cancel>
      <Button type="button" disabled={pending} onclick={() => revoke()}>{#if pending}<Spinner data-icon="inline-start" />{/if}Sign out other sessions</Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
