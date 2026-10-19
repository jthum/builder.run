<script lang="ts">
  import { setup } from "$lib/app/session.svelte.ts";
  import * as Card from "@jthum/framework/svelte/ui/card";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import { Input } from "@jthum/framework/svelte/ui/input";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";

  let name = $state("");
  let username = $state("");
  let password = $state("");
  let confirmation = $state("");
  let spaceName = $state("My Space");
  let pending = $state(false);
  let error = $state<string | null>(null);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    error = null;
    if (password !== confirmation) { error = "The passwords do not match."; return; }
    pending = true;
    try { await setup({ name, username, password, spaceName }); password = confirmation = ""; }
    catch (cause) { error = cause instanceof Error ? cause.message : "Unable to create your login."; }
    finally { pending = false; }
  }
</script>

<main class="flex min-h-svh items-center justify-center p-6">
  <Card.Root class="h-auto w-full max-w-md">
    <Card.Header>
      <Card.Title>Welcome to Builder.run</Card.Title>
      <Card.Description>Create your first login and a space to build in.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form onsubmit={submit}>
        <Field.FieldGroup>
          <Field.Field data-disabled={pending}>
            <Field.FieldLabel for="setup-name">Your name</Field.FieldLabel>
            <Input id="setup-name" name="name" autocomplete="name" bind:value={name} required disabled={pending} />
          </Field.Field>
          <Field.Field data-disabled={pending}>
            <Field.FieldLabel for="setup-username">Username</Field.FieldLabel>
            <Input id="setup-username" name="username" autocomplete="username" bind:value={username} required disabled={pending} />
          </Field.Field>
          <Field.Field data-disabled={pending}>
            <Field.FieldLabel for="setup-password">Password</Field.FieldLabel>
            <Input id="setup-password" name="password" type="password" autocomplete="new-password" bind:value={password} required minlength={12} maxlength={1024} disabled={pending} aria-describedby="setup-password-help" />
            <Field.FieldDescription id="setup-password-help">Use at least 12 characters.</Field.FieldDescription>
          </Field.Field>
          <Field.Field data-disabled={pending} data-invalid={Boolean(confirmation && confirmation !== password)}>
            <Field.FieldLabel for="setup-confirmation">Confirm password</Field.FieldLabel>
            <Input id="setup-confirmation" name="confirmation" type="password" autocomplete="new-password" bind:value={confirmation} required disabled={pending} aria-invalid={Boolean(confirmation && confirmation !== password)} />
          </Field.Field>
          <Field.Field data-disabled={pending}>
            <Field.FieldLabel for="setup-space">Space name</Field.FieldLabel>
            <Input id="setup-space" name="spaceName" bind:value={spaceName} required disabled={pending} />
          </Field.Field>
          {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
          <Button type="submit" disabled={pending}>{#if pending}<Spinner data-icon="inline-start" />{/if}Create login and get started</Button>
          <Field.FieldDescription>This is a new installation. Your login will manage its first space. Only continue if you are setting up this server.</Field.FieldDescription>
          <Button type="button" variant="link" onclick={() => location.reload()} disabled={pending}>Already set up in another tab? Sign in</Button>
        </Field.FieldGroup>
      </form>
    </Card.Content>
  </Card.Root>
</main>
