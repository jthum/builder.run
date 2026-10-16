import { describe, expect, it, vi } from "vite-plus/test";
import {
  ChartInteraction,
  chartDash,
  chartKeyIndex,
  chartPatternId,
} from "./chart-interaction.svelte.ts";

const first = { id: "a", key: "Alpha", text: "Alpha: 7" };
const second = { id: "b", key: "Beta", text: "Beta: 3" };

describe("chart interaction", () => {
  it("links mark and legend highlighting by exact identity, not label prefixes", () => {
    const interaction = new ChartInteraction();
    const legend = interaction.events({ ...first, id: "legend:Alpha" });
    legend.onpointerenter();
    expect(interaction.state("Alpha")["data-chart-active"]).toBe(true);
    expect(interaction.state("Alpha extended")["data-chart-muted"]).toBe(true);
    expect(interaction.state("Beta")["data-chart-muted"]).toBe(true);
    legend.onpointerleave();
    interaction.events(first).onpointerenter();
    expect(interaction.state("Alpha")["data-chart-active"]).toBe(true);
    expect(interaction.state("Alpha", "a")["data-chart-selected"]).toBe(true);
  });

  it("restores keyboard focus when the pointer leaves and dismisses with Escape", () => {
    const interaction = new ChartInteraction();
    const focused = interaction.events(first);
    const pointer = interaction.events(second);
    focused.onfocus();
    pointer.onpointerenter();
    expect(interaction.active).toEqual(second);
    pointer.onpointerleave();
    expect(interaction.active).toEqual(first);
    focused.onkeydown({ key: "Escape" } as KeyboardEvent);
    expect(interaction.active).toBeNull();
    focused.onfocus();
    focused.onblur();
    expect(interaction.active).toBeNull();
  });

  it("can hide and restore every series without retaining a hidden highlight", () => {
    const interaction = new ChartInteraction();
    interaction.events(first).onfocus();
    interaction.toggle("Alpha");
    interaction.toggle("Beta");
    expect([...interaction.hidden]).toEqual(["Alpha", "Beta"]);
    expect(interaction.active).toBeNull();
    expect(interaction.state("Beta")["data-chart-muted"]).toBeUndefined();
    interaction.toggle("Alpha");
    expect(interaction.active).toEqual(first);
    expect(interaction.hidden.has("Alpha")).toBe(false);
  });

  it("provides one tab stop, remembers the cursor, and focuses only within its plot", () => {
    const interaction = new ChartInteraction();
    const ids = ["a", "b"];
    const nodes = [{ focus: vi.fn() }, { focus: vi.fn() }];
    const querySelectorAll = vi.fn(() => nodes);
    const closest = vi.fn(() => ({ querySelectorAll }));
    const preventDefault = vi.fn();
    expect(interaction.mark(first, ids).tabindex).toBe(0);
    expect(interaction.mark(second, ids).tabindex).toBe(-1);
    interaction.mark(first, ids).onkeydown({
      key: "ArrowRight",
      currentTarget: { closest },
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(closest).toHaveBeenCalledWith("[data-chart-plot]");
    expect(querySelectorAll).toHaveBeenCalledWith("[data-chart-item]");
    expect(nodes[1]!.focus).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    interaction.mark(second, ids).onfocus();
    interaction.mark(second, ids).onblur();
    expect(interaction.mark(first, ids).tabindex).toBe(-1);
    expect(interaction.mark(second, ids).tabindex).toBe(0);
    expect(interaction.mark(first, ["a"]).tabindex).toBe(0);
  });

  it("does not capture unrelated keys or fail when no plot is available", () => {
    const interaction = new ChartInteraction();
    const preventDefault = vi.fn();
    const closest = vi.fn(() => null);
    const events = interaction.mark(first, ["a"]);
    events.onkeydown({ key: "Tab", preventDefault } as unknown as KeyboardEvent);
    events.onkeydown({
      key: "ArrowLeft",
      currentTarget: { closest },
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(closest).toHaveBeenCalledOnce();
  });

  it("cleans up stale interaction after a dataset or visibility change", () => {
    const interaction = new ChartInteraction();
    interaction.mark(first, ["a", "b"]).onfocus();
    interaction.events(second).onpointerenter();
    interaction.hidden = new Set(["Removed"]);
    interaction.reconcile(["Beta"], ["b"]);
    expect(interaction.focused).toBeNull();
    expect(interaction.cursor).toBeNull();
    expect(interaction.hidden.size).toBe(0);
    expect(interaction.active).toEqual(second);
  });

  it.each([
    ["ArrowRight", 2, 3, 0],
    ["ArrowDown", 0, 3, 1],
    ["ArrowLeft", 0, 3, 2],
    ["ArrowUp", 2, 3, 1],
    ["Home", 2, 3, 0],
    ["End", 0, 3, 2],
    ["Tab", 0, 3, undefined],
    ["ArrowRight", 0, 0, undefined],
  ] as const)("handles %s at %s of %s", (key, index, count, expected) => {
    expect(chartKeyIndex(key, index, count)).toBe(expected);
  });

  it("scopes pattern IDs and repeats a finite set of distinguishable dash styles", () => {
    expect(chartPatternId("first-chart", 0)).not.toBe(chartPatternId("second-chart", 0));
    expect(new Set(Array.from({ length: 6 }, (_, index) => chartDash(index))).size).toBe(6);
    expect(chartDash(6)).toBe(chartDash(0));
  });
});
