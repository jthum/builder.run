import type { SpaceAccent } from "$lib/runtime/platform.ts";

export type NameTone = {
  hue: number;
  background: string;
  foreground: string;
  accent: string;
  gradient: string;
};

export type AccentTone = NameTone & {
  key: SpaceAccent;
  label: string;
  primary: string;
  ring: string;
};

export const SPACE_ACCENTS: Array<{ key: SpaceAccent; label: string; hue: number }> = [
  { key: "blue", label: "Blue", hue: 264 },
  { key: "violet", label: "Violet", hue: 300 },
  { key: "rose", label: "Rose", hue: 12 },
  { key: "orange", label: "Orange", hue: 52 },
  { key: "green", label: "Green", hue: 152 },
];

export function toneFromAccent(value?: SpaceAccent): AccentTone {
  const choice = SPACE_ACCENTS.find((item) => item.key === value) ?? SPACE_ACCENTS[0]!;
  const shift = (choice.hue + 18) % 360;
  return {
    key: choice.key,
    label: choice.label,
    hue: choice.hue,
    background: `oklch(0.78 0.12 ${choice.hue})`,
    foreground: `oklch(0.32 0.1 ${choice.hue})`,
    primary: `oklch(0.488 0.2 ${choice.hue})`,
    ring: `oklch(0.66 0.12 ${choice.hue})`,
    accent: `oklch(0.56 0.18 ${choice.hue})`,
    gradient: `linear-gradient(135deg, oklch(0.6 0.17 ${choice.hue}), oklch(0.5 0.15 ${shift}))`,
  };
}

export function applySpaceAccent(value?: SpaceAccent): void {
  if (typeof document === "undefined") return;
  const tone = toneFromAccent(value);
  const root = document.documentElement;
  root.style.setProperty("--primary", tone.primary);
  root.style.setProperty("--ring", tone.ring);
  root.style.setProperty("--sidebar-primary", tone.accent);
  root.style.setProperty("--app-gradient", tone.gradient);
  root.style.setProperty("--app-hue", String(tone.hue));
  root.style.setProperty("--app-accent", tone.accent);
}

function hashHue(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

export function toneFromName(name: string): NameTone {
  const hue = hashHue(name.trim() || "app");
  const shift = (hue + 28) % 360;
  return {
    hue,
    background: `oklch(0.78 0.12 ${hue})`,
    foreground: `oklch(0.32 0.1 ${hue})`,
    accent: `oklch(0.58 0.16 ${hue})`,
    gradient: `linear-gradient(135deg, oklch(0.6 0.17 ${hue}), oklch(0.5 0.15 ${shift}))`,
  };
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts.at(-1)?.slice(0, 1) ?? ""}`.toUpperCase();
}
