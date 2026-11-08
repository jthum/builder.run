import type { Component } from "svelte";
import type { Spec } from "@jthum/framework/spec";
export interface DeploymentTarget {
  key: string;
  label: string;
  description: string;
  load: () => Promise<{
    default: Component<{ spec: Spec; onClose: () => void; onBusyChange: (busy: boolean) => void }>;
  }>;
}
/** Metadata is cheap; each target UI, implementation and assets load after selection. */
export const deploymentTargets: readonly DeploymentTarget[] = [
  {
    key: "spacefast",
    label: "Spacefast",
    description: "Publish a separate app with a native Zero backend.",
    load: () => import("./spacefast/publisher.svelte"),
  },
];
