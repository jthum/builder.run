<script lang="ts">
  import { login } from "$lib/app/session.svelte.ts";
  import * as Card from "@jthum/framework/svelte/ui/card";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import { Input } from "@jthum/framework/svelte/ui/input";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";

  let username = $state("");
  let password = $state("");
  let pending = $state(false);
  let error = $state<string | null>(null);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    pending = true;
    error = null;
    try { await login(username, password); password = ""; }
    catch (cause) { error = cause instanceof Error ? cause.message : "Unable to sign in."; }
    finally { pending = false; }
  }
</script>

<main class="flex min-h-svh items-center justify-center p-6">
  <Card.Root class="h-auto w-full max-w-sm">
    <Card.Header>
      <Card.Title>Sign in to Builder.run</Card.Title>
      <Card.Description>Open your space and continue where you left off.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form onsubmit={submit}>
        <Field.FieldGroup>
          <Field.Field>
            <Field.FieldLabel for="login-username">Username</Field.FieldLabel>
            <Input id="login-username" name="username" autocomplete="username" bind:value={username} required disabled={pending} />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="login-password">Password</Field.FieldLabel>
            <Input id="login-password" name="password" type="password" autocomplete="current-password" bind:value={password} required disabled={pending} />
          </Field.Field>
          {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
          <Button type="submit" disabled={pending}>{#if pending}<Spinner data-icon="inline-start" />{/if}Sign in</Button>
        </Field.FieldGroup>
      </form>
    </Card.Content>
  </Card.Root>
</main>
