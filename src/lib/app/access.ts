import type { Actor, Permission } from "@jthum/framework/kernel";

export interface PersonAccess {
  readonly actor: Actor;
  readonly username?: string;
  readonly permissions: readonly Permission[];
  readonly roles?: readonly string[];
  readonly apps: readonly { appId: string; permissions: readonly Permission[] }[];
}

export interface PeopleInfo {
  readonly people: readonly PersonAccess[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly apps: readonly { id: string; name: string }[];
  readonly signInUrl: string;
}

export interface SecurityInfo {
  readonly username: string;
  readonly sessions: readonly {
    readonly id: string;
    readonly current: boolean;
    readonly createdAt: string;
    readonly expiresAt: string;
  }[];
}
