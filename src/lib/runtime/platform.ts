import type { Actor, AppSpec, StoreDef, TypeDef } from "./model.ts";

export interface WorkspaceState {
  id: string;
  name: string;
  spec: AppSpec;
}

export interface EnvironmentState {
  id: string;
  name: string;
  actors: Actor[];
  stores: StoreDef[];
  sharedTypes: TypeDef[];
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
}

export interface PlatformState {
  version: 1;
  activeEnvironmentId: string;
  environments: EnvironmentState[];
}
