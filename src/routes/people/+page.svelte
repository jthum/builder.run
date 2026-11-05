<script lang="ts">
  import { SERVER_MODE } from "$lib/app/deployment.ts";
  import { session } from "$lib/app/session.svelte.ts";
  import PeoplePage from "$lib/components/people-page.svelte";
  import * as Empty from "@jthum/framework/svelte/ui/empty";
</script>

{#if (!SERVER_MODE || session.permissions.space.includes("manage")) && session.framework}
  {#key `${session.actor?.id}:${session.framework.selection.spaceId}:${session.framework.selection.appId}`}
    <PeoplePage selection={session.framework.selection} />
  {/key}
{:else}
  <Empty.Root><Empty.Header><Empty.Title>People and access</Empty.Title><Empty.Description>{SERVER_MODE ? "You need permission to manage this Space." : "Server-side deployments support shared logins and access management."}</Empty.Description></Empty.Header></Empty.Root>
{/if}
