import type { Actor, Permission } from "@jthum/framework/kernel";

/** UI conveniences only. Authorization uses the stored Membership permissions. */
export const ACCESS_PRESETS: readonly {
  value: string;
  label: string;
  permissions: readonly Permission[];
}[] = [
  { value: "none", label: "No access", permissions: [] },
  { value: "viewer", label: "Viewer", permissions: ["read"] },
  { value: "editor", label: "Editor", permissions: ["read", "create", "update", "delete"] },
  {
    value: "manager",
    label: "Manager",
    permissions: ["read", "create", "update", "delete", "manage"],
  },
];

export function accessPreset(permissions: readonly Permission[]): string {
  return (
    ACCESS_PRESETS.find(
      (preset) =>
        preset.permissions.length === permissions.length &&
        preset.permissions.every((permission) => permissions.includes(permission)),
    )?.value ?? "custom"
  );
}

export interface PersonAccess {
  readonly actor: Actor;
  readonly username?: string;
  readonly permissions: readonly Permission[];
  readonly apps: readonly { appId: string; permissions: readonly Permission[] }[];
}

export interface PeopleInfo {
  readonly people: readonly PersonAccess[];
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
