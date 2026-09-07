import type { Actor, AppSpec } from "./model.ts";

export const SPACE_ACCENT_KEYS = ["blue", "violet", "rose", "orange", "green"] as const;
export type SpaceAccent = (typeof SPACE_ACCENT_KEYS)[number];

export interface SpaceAppearance {
  accent: SpaceAccent;
}

/** One primitive. An app is a space created by an actor from their account space. */
export interface SpaceState {
  id: string;
  name: string;
  /** Actor who created this space. Set on apps; absent on account spaces. */
  createdBy?: string;
  actors: Actor[];
  appearance?: SpaceAppearance;
  spec: AppSpec;
}

export interface PlatformState {
  version: 1;
  activeSpaceId: string;
  spaces: SpaceState[];
}
