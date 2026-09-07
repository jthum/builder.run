import { describe, expect, it } from "vite-plus/test";
import { initialsFromName, toneFromAccent, toneFromName } from "./color.ts";

describe("name color", () => {
  it("is stable for a name and different across names", () => {
    expect.hasAssertions();
    const you = toneFromName("You");
    const again = toneFromName("You");
    const ada = toneFromName("Ada Lovelace");
    expect(you.hue).toBe(again.hue);
    expect(you.gradient).toBe(again.gradient);
    expect(you.hue).not.toBe(ada.hue);
    expect(you.background).toContain("oklch");
    expect(you.accent).toContain("oklch");
    expect(you.gradient).toContain("linear-gradient");
  });

  it("builds up to two initials from the first and last words", () => {
    expect.hasAssertions();
    expect(initialsFromName("You")).toBe("Y");
    expect(initialsFromName("Ada Lovelace")).toBe("AL");
    expect(initialsFromName("Ada King Lovelace")).toBe("AL");
    expect(initialsFromName("  ")).toBe("A");
  });

  it("uses blue by default and resolves named space accents", () => {
    expect(toneFromAccent()).toMatchObject({ key: "blue", hue: 264 });
    expect(toneFromAccent("green")).toMatchObject({ key: "green", hue: 152 });
    expect(toneFromAccent("green").primary).toContain("oklch");
  });
});
