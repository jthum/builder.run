import { describe, expect, it, vi } from "vite-plus/test";
import { plainLinkClick, RecordPreview } from "./record-preview.svelte.ts";

function click(overrides = {}) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    button: 0,
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault,
    stopPropagation,
    ...overrides,
  } as unknown as MouseEvent;
  return { event, preventDefault, stopPropagation };
}

describe("record preview selection", () => {
  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { defaultPrevented: true },
  ])("preserves normal browser navigation for %s", (overrides) => {
    const preview = new RecordPreview();
    const event = click(overrides);
    preview.follow(event.event, "project", "one", []);
    expect(plainLinkClick(event.event)).toBe(false);
    expect(preview.selection).toBeNull();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("previews a plain click, retains the visible order and returns focus on close", () => {
    const preview = new RecordPreview();
    const trigger = { isConnected: true, focus: vi.fn() };
    const event = click({ currentTarget: trigger });
    preview.follow(event.event, "project", "two", [
      { id: "one" },
      { id: "two" },
      { id: "two" },
      {},
    ]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(preview.selection).toEqual({ typeKey: "project", id: "two", ids: ["one", "two"] });
    preview.move(-1);
    expect(preview.selection?.id).toBe("one");
    preview.move(-1);
    expect(preview.selection?.id).toBe("one");
    preview.move(1);
    preview.move(1);
    expect(preview.selection?.id).toBe("two");
    preview.close();
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(preview.selection).toBeNull();
  });

  it("does not steal focus when navigation closes the panel or the trigger is gone", () => {
    const preview = new RecordPreview();
    const trigger = { isConnected: true, focus: vi.fn() };
    preview.open("project", "one", [], trigger as unknown as HTMLElement);
    preview.close(false);
    expect(trigger.focus).not.toHaveBeenCalled();
    trigger.isConnected = false;
    preview.open("project", "one", [], trigger as unknown as HTMLElement);
    preview.close();
    expect(trigger.focus).not.toHaveBeenCalled();
  });

  it("does not intercept rows without a record identity", () => {
    const preview = new RecordPreview();
    const event = click();
    preview.follow(event.event, "project", undefined, []);
    expect(preview.selection).toBeNull();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
