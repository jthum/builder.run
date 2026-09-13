import { describe, expect, it } from "vite-plus/test";
import { loadWidgetRenderer, widgetCategories, widgets } from "./registry.ts";

describe("widget registry", () => {
  it("has unique keys and known categories", () => {
    expect.hasAssertions();
    const keys = widgets.map((widget) => widget.key);
    const categories = new Set(widgetCategories.map((category) => category.key));

    expect(new Set(keys).size).toBe(keys.length);
    expect(widgets.every((widget) => categories.has(widget.category))).toBe(true);
  });

  it("can lazy-load a renderer for every definition", async () => {
    expect.hasAssertions();
    const renderers = await Promise.all(widgets.map((widget) => loadWidgetRenderer(widget.key)));

    expect(renderers).toHaveLength(widgets.length);
    expect(renderers.every(Boolean)).toBe(true);
    await expect(loadWidgetRenderer("not-a-widget")).resolves.toBeUndefined();
  }, 15_000);
});
