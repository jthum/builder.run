export type NameTone = {
  hue: number;
  background: string;
  foreground: string;
  accent: string;
  gradient: string;
};

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
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}
