import { describe, expect, it } from "vite-plus/test";
import {
  areaPath,
  band,
  chartPalette,
  donutSlice,
  extent,
  linear,
  niceTicks,
  polyline,
  stackOffsets,
} from "./chart-geometry.ts";

describe("chart geometry", () => {
  it("stacks positive and negative values on separate sides of zero", () => {
    expect(stackOffsets([[3, -2, 4, -5, 0]])).toEqual([[0, 0, 3, -2, 7]]);
  });
  it("maps values onto a pixel range and keeps zero in domain when all values are positive", () => {
    expect.hasAssertions();
    expect(extent([3, 8, 5])).toEqual([0, 8]);
    const y = linear([0, 8], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(8)).toBe(0);
    expect(y(4)).toBe(50);
    const ticks = niceTicks(0, 8, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(8);
  });

  it("lays out equal bands and stacked offsets", () => {
    expect.hasAssertions();
    const slots = band(2, 0, 100, 0);
    expect(slots.bandwidth).toBe(50);
    expect(slots.x(0)).toBe(0);
    expect(slots.x(1)).toBe(50);
    expect(
      stackOffsets([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      [0, 1],
      [0, 3],
    ]);
  });

  it("builds path strings and a palette", () => {
    expect.hasAssertions();
    expect(
      polyline([
        [0, 1],
        [2, 3],
      ]),
    ).toBe("M 0 1 L 2 3");
    expect(
      areaPath(
        [
          [0, 1],
          [2, 3],
        ],
        10,
      ),
    ).toContain("L 2 10");
    expect(donutSlice(10, 10, 8, 4, 0, Math.PI)).toContain("A 8 8");
    expect(chartPalette(40, 3)).toHaveLength(3);
    expect(chartPalette(40, 3)[0]).toMatch(/^oklch\(/);
  });
});
