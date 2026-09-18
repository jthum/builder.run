import { expect, it } from "vite-plus/test";
import { pageBlocks, pagePresentation } from "./pages.ts";
import { createSpecId } from "$lib/runtime/ids.ts";

it("projects canonical Pages without changing identities or custom metadata", () => {
  const id = createSpecId();
  const groupId = createSpecId();
  const blockId = createSpecId();
  const page = {
    id,
    key: "reports",
    label: "Reports",
    meta: { custom: { sample: true }, folder: "Finance", icon: "chart" },
    layout: [
      {
        id: groupId,
        kind: "group" as const,
        columns: 1,
        minHeight: "m" as const,
        children: [
          { id: blockId, kind: "block" as const, block: "stat", config: { view: "invoices" } },
        ],
      },
    ],
  };
  const presentation = pagePresentation(page);
  expect(presentation.meta).toEqual(page.meta);
  expect(presentation).toMatchObject({ id, folder: "Finance", icon: "chart" });
  expect(presentation.blocks[0]).toMatchObject({
    id: groupId,
    min_height: "m",
    blocks: [{ id: blockId }],
  });
  expect(pageBlocks(page.layout)).toEqual(presentation.blocks);
  expect(pagePresentation({ ...page, label: "New name" }).blocks).toEqual(presentation.blocks);
});
