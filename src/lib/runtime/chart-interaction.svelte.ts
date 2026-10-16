export interface ChartDatum {
  id: string;
  key: string;
  text: string;
}

/** One tab stop per plot; arrows explore marks, Home/End reach the endpoints. */
export function chartKeyIndex(key: string, current: number, count: number): number | undefined {
  if (!count) return undefined;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/** Local to one chart. Pointer exit restores keyboard focus rather than clearing it. */
export class ChartInteraction {
  pointer = $state<ChartDatum | null>(null);
  focused = $state<ChartDatum | null>(null);
  cursor = $state<string | null>(null);
  hidden = $state(new Set<string>());

  get active(): ChartDatum | null {
    const item = this.pointer ?? this.focused;
    return item && !this.hidden.has(item.key) ? item : null;
  }

  toggle(key: string) {
    const next = new Set(this.hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.hidden = next;
  }

  dismiss() {
    this.pointer = null;
    this.focused = null;
  }

  reconcile(keys: string[], ids: string[]) {
    const valid = new Set(keys);
    const hidden = new Set([...this.hidden].filter((key) => valid.has(key)));
    if (hidden.size !== this.hidden.size) this.hidden = hidden;
    for (const source of ["pointer", "focused"] as const) {
      const item = this[source];
      if (
        item &&
        (!valid.has(item.key) ||
          (!ids.includes(item.id) &&
            !item.id.startsWith("legend:") &&
            !item.id.startsWith("series:")))
      )
        this[source] = null;
    }
    if (this.cursor && !ids.includes(this.cursor)) this.cursor = null;
  }

  state(key: string, id?: string) {
    return {
      "data-chart-active": this.active?.key === key || undefined,
      "data-chart-muted": (this.active !== null && this.active.key !== key) || undefined,
      "data-chart-selected": (id !== undefined && this.active?.id === id) || undefined,
    };
  }

  events(item: ChartDatum) {
    return {
      onpointerenter: () => {
        this.pointer = item;
      },
      onpointerleave: () => {
        if (this.pointer?.id === item.id) this.pointer = null;
      },
      onfocus: () => {
        this.focused = item;
      },
      onblur: () => {
        if (this.focused?.id === item.id) this.focused = null;
      },
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === "Escape") this.dismiss();
      },
    };
  }

  mark(item: ChartDatum, ids: string[]) {
    const events = this.events(item);
    const tabStop = ids.includes(this.cursor ?? "") ? this.cursor : ids[0];
    return {
      ...events,
      ...this.state(item.key, item.id),
      "data-chart-item": item.id,
      "aria-label": item.text,
      role: "img" as const,
      tabindex: tabStop === item.id ? 0 : -1,
      onfocus: () => {
        this.cursor = item.id;
        events.onfocus();
      },
      onkeydown: (event: KeyboardEvent) => {
        events.onkeydown(event);
        const index = chartKeyIndex(event.key, ids.indexOf(item.id), ids.length);
        if (index === undefined) return;
        const plot = (event.currentTarget as Element).closest("[data-chart-plot]");
        const next = plot?.querySelectorAll<HTMLElement | SVGElement>("[data-chart-item]")[index];
        if (next) {
          event.preventDefault();
          next.focus();
        }
      },
    };
  }
}

export function chartPatternId(prefix: string, index: number): string {
  return `${prefix}-pattern-${index}`;
}

export function chartDash(index: number): string | undefined {
  return [undefined, "8 3", "2 3", "8 3 2 3", "1 4", "12 4"][index % 6];
}
