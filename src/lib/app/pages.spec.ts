import { expect, it } from "vite-plus/test";
import { pageBlocks, pageDefinition, pagePresentation } from "./pages.ts";
import { createSpecId } from "$lib/runtime/ids.ts";

it("passes stable Page identities and custom metadata through Studio", () => {
  const id = createSpecId();
  const groupId = createSpecId();
  const blockId = createSpecId();
  const page = {
    id,
    key: "reports",
    label: "Reports",
    folder: "Finance",
    icon: "chart",
    meta: { custom: { sample: true } },
    blocks: [
      {
        id: groupId,
        kind: "group" as const,
        columns: 1,
        min_height: "m" as const,
        blocks: [
          { id: blockId, kind: "block" as const, block: "stat", config: { view: "invoices" } },
        ],
      },
    ],
  };
  const definition = pageDefinition(page);
  expect(definition.meta).toEqual({ custom: { sample: true }, folder: "Finance", icon: "chart" });
  expect(definition.layout[0]).toMatchObject({
    id: groupId,
    minHeight: "m",
    children: [{ id: blockId }],
  });
  expect(pageBlocks(definition.layout)).toEqual(page.blocks);
  expect(pagePresentation(definition)).toMatchObject(page);
  expect(
    pageDefinition({ ...page, label: "New name", blocks: pageBlocks(definition.layout) }).layout,
  ).toEqual(definition.layout);
});
