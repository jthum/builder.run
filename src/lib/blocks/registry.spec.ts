import { describe, expect, it } from "vite-plus/test";
import { configureBlockConfig } from "$lib/runtime/blocks.ts";
import { previewSpec } from "./preview-fixtures.ts";
import {
  loadBlockPreview,
  loadBlock,
  officialBlockRegistry,
  blockCategories,
  blockRegistrySources,
  blocks,
} from "./registry.ts";

describe("block registry", () => {
  it("has unique keys and known categories", () => {
    expect.hasAssertions();
    const keys = blocks.map((block) => block.key);
    const categories = new Set(blockCategories.map((category) => category.key));

    expect(new Set(keys).size).toBe(keys.length);
    expect(blocks.every((block) => categories.has(block.category))).toBe(true);
  });

  it("exposes the official blocks through the installed registry-source contract", () => {
    expect(blockRegistrySources).toEqual([officialBlockRegistry]);
    expect(officialBlockRegistry.kind).toBe("bundled");
    expect(officialBlockRegistry.blocks).toEqual(blocks);
    expect(blockRegistrySources.flatMap((source) => source.blocks)).toEqual(blocks);
  });

  it("can lazy-load a component for every definition", async () => {
    expect.hasAssertions();
    const components = await Promise.all(blocks.map((block) => loadBlock(block.key)));

    expect(components).toHaveLength(blocks.length);
    expect(components.every(Boolean)).toBe(true);
    await expect(loadBlock("not-a-block")).resolves.toBeUndefined();
  }, 15_000);

  it("provides a lazy preview for every official block", async () => {
    expect.hasAssertions();
    const previews = await Promise.all(blocks.map((block) => loadBlockPreview(block.key)));

    expect(previews).toHaveLength(blocks.length);
    expect(previews.every((preview) => preview && typeof preview.config === "object")).toBe(true);
    for (const [index, block] of blocks.entries()) {
      const preview = previews[index];
      expect(() =>
        configureBlockConfig(preview?.spec ?? previewSpec, block, preview?.config),
      ).not.toThrow();
    }
    await expect(loadBlockPreview("not-a-block")).resolves.toBeUndefined();
  });
});
