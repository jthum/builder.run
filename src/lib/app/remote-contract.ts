import type { Actor, Permission, Workspace } from "@jthum/framework/kernel";
import type { AppSelection } from "$lib/framework/bootstrap.ts";
import type { encodeRuntimeInfo } from "$lib/framework/runtime-info.ts";

export interface RemoteSnapshot {
  readonly realmId: string;
  readonly selection: AppSelection;
  readonly actorId: string;
  readonly space: Workspace;
  readonly app: Workspace;
  readonly apps: readonly Workspace[];
  readonly spaces: readonly Workspace[];
  readonly actors: readonly (Actor & { readonly roles: readonly string[] })[];
  readonly actor: Actor & { readonly roles: readonly string[] };
  readonly profiles: ReturnType<typeof encodeRuntimeInfo>;
  readonly permissions: {
    readonly space: readonly Permission[];
    readonly app: readonly Permission[];
  };
  readonly revision: number;
  readonly databases: readonly { name: string; bytes?: number; open: boolean }[];
}
