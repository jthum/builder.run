<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { Spec } from "@jthum/framework/spec";
  import * as Dialog from "@jthum/framework/svelte/ui/dialog";
  import * as Field from "@jthum/framework/svelte/ui/field";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import { Input } from "@jthum/framework/svelte/ui/input";
  import { OptionSelect } from "@jthum/framework/svelte/ui/option-select";
  import { Spinner } from "@jthum/framework/svelte/ui/spinner";
  import * as target from "./index.ts";
  import type { SpacefastApi,SpacefastPublish,Team,Space } from "./index.ts";

  let {spec,onClose,onBusyChange}: {spec:Spec;onClose:()=>void;onBusyChange:(busy:boolean)=>void}=$props();
  let key=$state("");
  let api=$state<SpacefastApi>();
  let teams=$state<Team[]>([]);
  let teamId=$state("");
  let spaces=$state<Space[]>([]);
  let spaceId=$state("");
  let search=$state("");
  let cursor=$state<string>();
  let owner=$state("");
  let pending=$state(false);
  let progress=$state("");
  let error=$state("");
  let result=$state<{spaceId:string;versionId:string;url?:string}>();
  let prepared=$state<Awaited<ReturnType<typeof target["prepare"]>>>();
  let publish=$state.raw<SpacefastPublish>();
  let controller=new AbortController();
  const storageKey=`builder.run:deployment:${untrack(()=>spec.id)}:spacefast`;
  try {const saved=JSON.parse(localStorage.getItem(storageKey)??"null");if(saved){teamId=saved.teamId;spaceId=saved.spaceId;owner=saved.owner;}}catch { /* Destination preferences are optional. */ }
  const id=$props.id();


  onDestroy(()=>{controller.abort();key="";api=undefined;target.release();});
  async function work(task:()=>Promise<void>){controller=new AbortController();pending=true;onBusyChange(true);error="";try{await task();}catch(cause){error=cause instanceof Error?cause.message:String(cause);}finally{pending=false;onBusyChange(false);progress="";}}
  function saveDestination(){try{localStorage.setItem(storageKey,JSON.stringify({teamId,spaceId,owner}));}catch(cause){console.warn("Could not remember deployment destination",cause);}}
  async function connect(){await work(async()=>{
        const next=new target.SpacefastApi(key.trim());
    const context=await next.bootstrap(controller.signal);
    teams=context.teams;api=next;
    if(!teams.some(team=>team.id===teamId))teamId=teams[0]?.id??"";
    if(!owner && context.me?.email)owner=context.me.email;
    await loadSpaces();
  });}
  async function loadSpaces(next?:string){if(!api||!teamId)return;const page=await api.spaces(teamId,search,next,controller.signal);spaces=next?[...spaces,...page.spaces]:page.spaces;cursor=page.nextCursor;}
  async function createSpace(){await work(async()=>{
    if(!api||!teamId)return;
    progress="Creating your Space…";
    const space=await api.createSpace(teamId,spec.label,controller.signal);
    if(space.teamId!==teamId)throw new Error("Spacefast returned a different team.");
    spaces=[space,...spaces];spaceId=space.id;saveDestination();
  });}
  async function prepareApp(){await work(async()=>{progress="Preparing your app locally…";prepared=await target.prepare(spec);});}
  async function deploy(){await work(async()=>{
    if(!api||!spaceId||!owner.trim())return;
    if(!publish){
      const destination=await api.space(spaceId,controller.signal);
      if(destination.teamId!==teamId)throw new Error("This Space belongs to another team.");
      progress="Checking the deployed schema…";
      const previous=await api.schema(spaceId,controller.signal);
      progress="Preparing your app locally…";
      prepared=await target.prepare(spec,previous);
      progress="Setting the deployment owner…";
      await api.setOwner(spaceId,owner.trim(),AbortSignal.any([controller.signal,AbortSignal.timeout(240000)]));
      saveDestination();
      publish=api.startPublish({spaceId,teamId,files:prepared.files,sourceMetadata:prepared.sourceMetadata},message=>progress=message);
    }
    result=await publish.run(AbortSignal.any([controller.signal,AbortSignal.timeout(240000)]));
  });}
  function download(){if(!prepared)return;const body={format:"builder.run.spacefast-deployment.v1",sourceMetadata:prepared.sourceMetadata,files:prepared.files.map(file=>{let text="";for(let offset=0;offset<file.bytes.length;offset+=16384)text+=String.fromCharCode(...file.bytes.subarray(offset,offset+16384));return {path:file.path,contentType:file.contentType,contentBase64:btoa(text)};})};const url=URL.createObjectURL(new Blob([JSON.stringify(body)],{type:"application/json"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=`${spec.key}-spacefast.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
</script>

    {#if result}
      <Alert.Root><Alert.Title>Your app is live</Alert.Title><Alert.Description>Version {result.versionId} is active on Spacefast.</Alert.Description></Alert.Root>
      {#if result.url}<Button href={result.url} target="_blank" rel="noopener noreferrer">Open app</Button>{/if}
    {:else}
      <Field.Group>

        {#if !api}
          <Field.Field><Field.Label for={`${id}-key`}>Spacefast API key</Field.Label><Input id={`${id}-key`} type="password" bind:value={key} autocomplete="off" spellcheck={false} disabled={pending} /><Field.Description>Paste a key from your Spacefast account. It stays in memory and goes directly to Spacefast.</Field.Description></Field.Field>
          <div><Button onclick={connect} disabled={!key.trim()||pending}>Connect to Spacefast</Button></div>
        {:else}
          <Field.Field><Field.Label for={`${id}-team`}>Team</Field.Label><OptionSelect id={`${id}-team`} value={teamId} options={teams.map(team=>({value:team.id,label:team.name}))} disabled={pending||Boolean(publish)} onValueChange={value=>{teamId=value;spaceId="";void work(()=>loadSpaces());}} /></Field.Field>
          <Field.Field><Field.Label for={`${id}-search`}>Find a Space</Field.Label><div class="flex gap-2"><Input id={`${id}-search`} bind:value={search} placeholder="Search your Spaces…" disabled={pending||Boolean(publish)} /><Button variant="outline" onclick={()=>work(()=>loadSpaces())} disabled={pending||Boolean(publish)}>Search</Button></div></Field.Field>
          <Field.Field><Field.Label for={`${id}-space`}>Space</Field.Label><OptionSelect id={`${id}-space`} bind:value={spaceId} options={spaces.map(space=>({value:space.id,label:space.title}))} placeholder="Choose a dedicated Space" disabled={pending||Boolean(publish)} /><Field.Description>Each published app uses its own Space. Existing files will be replaced by this app's deployment.</Field.Description></Field.Field>
          <div class="flex gap-2">{#if cursor}<Button variant="outline" onclick={()=>work(()=>loadSpaces(cursor))} disabled={pending}>Load more</Button>{/if}<Button variant="outline" onclick={createSpace} disabled={pending||!teamId||Boolean(publish)}>Create a new Space</Button></div>
          <Field.Field><Field.Label for={`${id}-owner`}>Owner's sign-in email</Field.Label><Input id={`${id}-owner`} type="email" bind:value={owner} disabled={pending||Boolean(publish)} /><Field.Description>Sign in to the published app with this verified email.</Field.Description></Field.Field>
        {/if}
      </Field.Group>
      <p class="text-sm text-muted-foreground">This publishes the app's definitions and interface. Existing browser records and stored credentials are not uploaded.</p>
      {#if prepared}<p class="text-sm text-muted-foreground">Prepared locally · {prepared.files.length} files · {(prepared.files.reduce((total,file)=>total+file.bytes.length,0)/1048576).toFixed(1)} MB</p>{/if}
    {/if}
    {#if error}<Alert.Root variant="destructive"><Alert.Title>Deployment couldn't finish</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    {#if pending}<p role="status" class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{progress||"Connecting…"}</p>{/if}
    <Dialog.Footer>
      {#if pending}<Button variant="outline" onclick={()=>controller.abort()}>Stop waiting</Button>{:else}<Button variant="outline" onclick={onClose}>Close</Button>{/if}
      {#if !result}
        <Button variant="outline" onclick={prepared?download:prepareApp} disabled={pending}>{prepared?"Download prepared app":"Prepare locally"}</Button>
        {#if api}<Button onclick={deploy} disabled={pending||!spaceId||!owner.trim()}>{publish?"Resume deployment":"Deploy app"}</Button>{/if}
      {/if}
    </Dialog.Footer>
