import type { Actor, AppSpec } from "./model.ts";

/** One primitive. An app is a space created by an actor from their account space. */
export interface SpaceState {
  id: string;
  name: string;
  /** Actor who created this space. Set on apps; absent on account spaces. */
  createdBy?: string;
  actors: Actor[];
  spec: AppSpec;
}

export interface PlatformState {
  version: 1;
  activeSpaceId: string;
  spaces: SpaceState[];
}
