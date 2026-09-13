import { describe, expect, it } from "vite-plus/test";
import { configureWidgetValues } from "$lib/runtime/widgets.ts";
import { previewSpec } from "./preview-fixtures.ts";
import {
  loadWidgetPreview,
  loadWidgetRenderer,
  officialWidgetRegistry,
  widgetCategories,
  widgetRegistrySources,
  widgets,
} from "./registry.ts";

describe("widget registry", () => {
  it("has unique keys and known categories", () => {
    expect.hasAssertions();
    const keys = widgets.map((widget) => widget.key);
    const categories = new Set(widgetCategories.map((category) => category.key));

    expect(new Set(keys).size).toBe(keys.length);
    expect(widgets.every((widget) => categories.has(widget.category))).toBe(true);
  });

  it("exposes the official widgets through the installed registry-source contract", () => {
    expect(widgetRegistrySources).toEqual([officialWidgetRegistry]);
    expect(officialWidgetRegistry.kind).toBe("bundled");
    expect(officialWidgetRegistry.widgets).toEqual(widgets);
    expect(widgetRegistrySources.flatMap((source) => source.widgets)).toEqual(widgets);
  });

  it("can lazy-load a renderer for every definition", async () => {
    expect.hasAssertions();
    const renderers = await Promise.all(widgets.map((widget) => loadWidgetRenderer(widget.key)));

    expect(renderers).toHaveLength(widgets.length);
    expect(renderers.every(Boolean)).toBe(true);
    await expect(loadWidgetRenderer("not-a-widget")).resolves.toBeUndefined();
  }, 15_000);

  it("provides a lazy preview for every official widget", async () => {
    expect.hasAssertions();
    const previews = await Promise.all(widgets.map((widget) => loadWidgetPreview(widget.key)));

    expect(previews).toHaveLength(widgets.length);
    expect(previews.every((preview) => preview && typeof preview.values === "object")).toBe(true);
    for (const [index, widget] of widgets.entries()) {
      const preview = previews[index];
      expect(() =>
        configureWidgetValues(preview?.spec ?? previewSpec, widget, preview?.values),
      ).not.toThrow();
    }
    await expect(loadWidgetPreview("not-a-widget")).resolves.toBeUndefined();
  });
});
