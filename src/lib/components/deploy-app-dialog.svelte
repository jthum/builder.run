<script lang="ts">
  import type { Spec } from "@jthum/framework/spec";
  import * as Dialog from "@jthum/framework/svelte/ui/dialog";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import { OptionSelect } from "@jthum/framework/svelte/ui/option-select";
  import { deploymentTargets } from "$lib/deployments/registry.ts";
  let {open=$bindable(false),spec}: {open?:boolean;spec:Spec}=$props();
  let selected=$state(deploymentTargets[0]!.key);
  let pending=$state(false);
  const target=$derived(deploymentTargets.find(target=>target.key===selected));
  const id=$props.id();
</script>

<Dialog.Root {open} onOpenChange={value=>{if(!pending)open=value;}}>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header><Dialog.Title>Deploy {spec.label}</Dialog.Title><Dialog.Description>Publish a separate app. Keep making model changes here, then deploy again.</Dialog.Description></Dialog.Header>
    <Field.Field><Field.Label for={id}>Target</Field.Label><OptionSelect {id} bind:value={selected} options={deploymentTargets.map(target=>({value:target.key,label:target.label}))} disabled={pending} /></Field.Field>
    {#if target}
      {#key target.key}
        {#await target.load()}
          <p role="status" class="text-sm text-muted-foreground">Loading deployment target…</p>
        {:then module}
          <module.default {spec} onClose={()=>open=false} onBusyChange={busy=>pending=busy} />
        {:catch error}
          <p role="alert" class="text-sm text-destructive">{error instanceof Error?error.message:"The deployment target could not be loaded."}</p>
        {/await}
      {/key}
    {/if}
  </Dialog.Content>
</Dialog.Root>
