export const SPACE_ACCENT_KEYS = ["blue", "violet", "rose", "orange", "green"] as const;
export type SpaceAccent = (typeof SPACE_ACCENT_KEYS)[number];
