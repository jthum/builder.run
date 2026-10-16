export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function extent(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  let min = values[0] ?? 0;
  let max = values[0] ?? 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) {
    if (min === 0) return [0, 1];
    if (min > 0) return [0, max];
    return [min, 0];
  }
  if (min > 0) min = 0;
  return [min, max];
}

function niceStep(range: number, ticks: number): number {
  const rough = range / Math.max(1, ticks);
  const exp = Math.floor(Math.log10(Math.max(rough, 1e-9)));
  const frac = rough / 10 ** exp;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi === lo) return [lo];
  const step = niceStep(hi - lo, count);
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= hi + step / 2; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  if (!ticks.includes(0) && lo <= 0 && hi >= 0) ticks.push(0);
  return [...new Set(ticks)].sort((a, b) => a - b);
}

export function linear(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function band(count: number, start: number, end: number, padding = 0.24) {
  const n = Math.max(count, 1);
  const inner = Math.max(end - start, 0);
  const step = inner / n;
  const gap = step * padding;
  const bandwidth = Math.max(step - gap, 0);
  return {
    bandwidth,
    x(index: number) {
      return start + index * step + gap / 2;
    },
  };
}

export function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

export function donutSlice(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  if (sweep <= 0) return "";
  const large = sweep > Math.PI ? 1 : 0;
  const [x1, y1] = polar(cx, cy, outer, start);
  const [x2, y2] = polar(cx, cy, outer, end);
  const [x3, y3] = polar(cx, cy, inner, end);
  const [x4, y4] = polar(cx, cy, inner, start);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

export function polyline(points: Array<[number, number]>): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

export function areaPath(points: Array<[number, number]>, y0: number): string {
  if (!points.length) return "";
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `${polyline(points)} L ${last[0]} ${y0} L ${first[0]} ${y0} Z`;
}

export function stackOffsets(columns: number[][]): number[][] {
  return columns.map((column) => {
    let positive = 0;
    let negative = 0;
    return column.map((value) => {
      const start = value < 0 ? negative : positive;
      if (value < 0) negative += value;
      else positive += value;
      return start;
    });
  });
}

export function chartPalette(hue: number, count: number): string[] {
  const n = Math.max(count, 1);
  return Array.from({ length: n }, (_, index) => {
    const next = (hue + index * Math.max(28, Math.floor(360 / n))) % 360;
    const chroma = 0.14 + (index % 3) * 0.02;
    const light = 0.62 - (index % 2) * 0.06;
    return `oklch(${light} ${chroma} ${next})`;
  });
}
