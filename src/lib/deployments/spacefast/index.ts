import { asset } from "$app/paths";
import type { Spec } from "@jthum/framework/spec";
import {
  prepareBrowserDeployment,
  type BrowserTemplate,
} from "../../../../examples/spacefast-zero/deployment/browser.ts";
import { SpacefastApi } from "./api.ts";
import { spacefastRelayFetch } from "./transport.ts";
export { SpacefastApi, SpacefastError } from "./api.ts";
export type { Space, Team, SpacefastPublish } from "./api.ts";
let template: Promise<BrowserTemplate> | undefined;
export function prepare(spec: Spec, previous: Parameters<typeof prepareBrowserDeployment>[2] = {}) {
  template ??= fetch(
    asset("deployment-assets/spacefast/template.json.gz" as Parameters<typeof asset>[0]),
    { cache: "no-cache" },
  )
    .then(async (response) => {
      if (!response.ok)
        throw new Error(
          "Deployment assets are unavailable. Rebuild Builder.run with its deployment assets.",
        );
      const bytes = await response.arrayBuffer();
      const prefix = new Uint8Array(bytes);
      // Some hosts decode gzip at the HTTP layer; others serve the compressed file as bytes.
      if (prefix[0] === 31 && prefix[1] === 139)
        return new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).json() as Promise<BrowserTemplate>;
      return JSON.parse(new TextDecoder().decode(bytes)) as BrowserTemplate;
    })
    .catch((error) => {
      template = undefined;
      throw error;
    });
  return template.then((value) => prepareBrowserDeployment(value, spec, previous));
}

export function release() {
  template = undefined;
}

const relay = import.meta.env.VITE_SPACEFAST_RELAY_URL?.trim();
export const usesRelay = Boolean(relay);
export function connect(key: string) {
  return new SpacefastApi(key, relay ? spacefastRelayFetch(relay) : fetch);
}
