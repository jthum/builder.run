export interface RecordSelection {
  typeKey: string;
  id: string;
  ids: string[];
}

export function plainLinkClick(
  event: Pick<
    MouseEvent,
    "button" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "defaultPrevented"
  >,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

export class RecordPreview {
  selection = $state<RecordSelection | null>(null);
  private trigger: HTMLElement | null = null;

  open(typeKey: string, id: string, ids: string[] = [], trigger?: HTMLElement | null) {
    if (!typeKey || !id) return;
    this.trigger = trigger ?? null;
    this.selection = { typeKey, id, ids: [...new Set(ids.filter(Boolean).concat(id))] };
  }

  follow(event: MouseEvent, typeKey: string, id: unknown, rows: Record<string, unknown>[]) {
    if (!plainLinkClick(event) || typeof id !== "string" || !id) return;
    event.preventDefault();
    event.stopPropagation();
    this.open(
      typeKey,
      id,
      rows.flatMap((row) => (typeof row.id === "string" ? [row.id] : [])),
      event.currentTarget as HTMLElement,
    );
  }

  move(offset: -1 | 1) {
    const current = this.selection;
    if (!current) return;
    const id = current.ids[current.ids.indexOf(current.id) + offset];
    if (id) this.selection = { ...current, id };
  }

  close(restoreFocus = true) {
    this.selection = null;
    if (restoreFocus && this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.trigger = null;
  }
}

// UI selection only. Record data is loaded by the host using its current authorized client.
export const recordPreview = new RecordPreview();
