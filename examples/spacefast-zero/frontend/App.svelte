<script lang="ts">
  import { collectionLabel } from "$lib/app/labels.ts";
  import { onMount } from "svelte";
  import { retryAuth, signInWithSpacefast, signOut } from "@spacefast/zero/client";
  import { Button } from "@jthum/framework/svelte/ui/button";
  import * as Alert from "@jthum/framework/svelte/ui/alert";
  import { Toaster } from "svelte-sonner";
  import Content from "./Content.svelte";
  import { canonicalStudio as data } from "./data.svelte.ts";
  import RecordPreview from "$lib/components/record-preview.svelte";
  import { recordPreview, plainLinkClick } from "$lib/app/record-preview.svelte.ts";

  let path = $state(location.pathname);
  let pending = $state(true);
  let error = $state("");
  function navigate(href: string) { history.pushState(null,"",href); path=location.pathname; recordPreview.close(false); }
  async function connect() {
    pending=true; error="";
    try { await retryAuth(); await data.connect(); }
    catch(cause) { error=cause instanceof Error ? cause.message : String(cause); }
    finally { pending=false; }
  }
  async function signIn() { try { await signInWithSpacefast({returnTo:location.href}); } catch(cause) { error=String(cause); } }
  onMount(() => {
    void connect();
    const pop = () => { path=location.pathname; recordPreview.close(false); };
    const click = (event: MouseEvent) => {
      const anchor=(event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !plainLinkClick(event) || anchor.target || anchor.download || anchor.origin!==location.origin || anchor.hash) return;
      event.preventDefault(); navigate(anchor.pathname+anchor.search);
    };
    window.addEventListener("popstate",pop); document.addEventListener("click",click);
    return () => { window.removeEventListener("popstate",pop); document.removeEventListener("click",click); };
  });
</script>

<svelte:head><title>{data.spec?.label ?? "App"}</title></svelte:head>
{#if !data.context}
  <main class="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-5 p-6">
    <h1 class="text-2xl font-semibold">Welcome</h1>
    {#if pending}<p role="status" class="text-muted-foreground">Opening your app…</p>
    {:else}
      {#if error}<Alert.Root><Alert.Title>Sign in to continue</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
      <div class="flex gap-3"><Button onclick={signIn}>Sign in with Spacefast</Button><Button variant="outline" onclick={connect}>Try again</Button></div>
    {/if}
  </main>
{:else}
  <div class="flex min-h-svh flex-col bg-sidebar md:flex-row">
    <aside class="flex shrink-0 flex-col gap-5 p-4 md:sticky md:top-0 md:h-svh md:w-60">
      <a href="/" class="px-3 py-2 font-semibold">{data.spec?.label}</a>
      <nav aria-label="App" class="flex flex-col gap-1">
        {#each data.spec?.pages ?? [] as page (page.id)}<Button variant={path===`/p/${page.key}` || (path==="/" && page.key==="home") ? "secondary" : "ghost"} class="justify-start" href={`/p/${page.key}`}>{page.label}</Button>{/each}
        {#each data.context.views.filter(view=>!view.implicit) as view (view.id)}<Button variant={path===`/v/${view.key}` ? "secondary" : "ghost"} class="justify-start" href={`/v/${view.key}`}>{view.label}</Button>{/each}
        {#each data.context.collections as collection (collection.id)}<Button variant={path.startsWith(`/t/${collection.key}`) ? "secondary" : "ghost"} class="justify-start" href={`/t/${collection.key}`}>{collectionLabel(collection)}</Button>{/each}
        {#each data.context.forms.filter(form=>!form.implicit && form.mode!=="edit") as form (form.id)}<Button variant={path===`/f/${form.key}` ? "secondary" : "ghost"} class="justify-start" href={`/f/${form.key}`}>{form.label}</Button>{/each}
      </nav>
      <div class="mt-auto"><Button variant="ghost" onclick={async()=>{await signOut();location.reload();}}>Sign out</Button></div>
    </aside>
    <main class="min-w-0 flex-1 rounded-2xl border bg-background p-5 md:m-3 md:ml-0 md:p-8">
      {#key path}<Content {path} {navigate} />{/key}
    </main>
  </div>
  <RecordPreview />
{/if}
<Toaster />
