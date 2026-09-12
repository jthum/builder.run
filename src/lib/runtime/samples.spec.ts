import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { sampleApps } from "./samples.ts";
import { configurePageRows } from "./widgets.ts";
import type { PageBlock } from "./model.ts";

function expectWideWidgetsUseOneColumn(blocks: PageBlock[]): void {
  for (const block of blocks) {
    if (block.kind !== "group") continue;
    if (
      block.blocks.some(
        (child) => child.kind === "widget" && (child.widget === "table" || child.widget === "form"),
      )
    ) {
      expect(block.columns).toBe(1);
    }
    expectWideWidgetsUseOneColumn(block.blocks);
  }
}

describe("starter app templates", () => {
  for (const sample of sampleApps) {
    it(`loads ${sample.label} with usable data, views, and pages`, async () => {
      expect.hasAssertions();
      const host = await Host.open();

      await host.loadSample(sample.key);

      const spec = host.resolvedSpec();
      for (const type of sample.spec.types) {
        const expected = sample.records?.filter((record) => record.type === type.key).length ?? 0;
        expect(await host.listRecords(type.key)).toHaveLength(expected);
      }
      for (const view of sample.spec.views) {
        expect((await host.queryView(view.key)).length).toBeGreaterThan(0);
      }
      for (const page of sample.spec.pages) {
        expect(() => configurePageRows(spec, page.blocks)).not.toThrow();
        expectWideWidgetsUseOneColumn(page.blocks);
      }
      expect(sample.spec.pages.some((page) => page.key === "home" && !page.implicit)).toBe(true);
    });
  }
});
