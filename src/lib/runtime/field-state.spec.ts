import { describe, expect, it } from "vite-plus/test";
import { evaluateFieldCondition, resolveFieldState } from "./field-state.ts";
import type { FieldDraft } from "$lib/blocks/presentation.ts";

describe("field state", () => {
  it("evaluates nested conditions against sibling answers", () => {
    expect(
      evaluateFieldCondition(
        {
          all: [
            { field: "country", op: "eq", value: "us" },
            {
              any: [
                { field: "kind", op: "eq", value: "business" },
                { field: "amount", op: "gte", value: 100 },
              ],
            },
          ],
        },
        { country: "us", kind: "personal", amount: 125 },
      ),
    ).toBe(true);
  });

  it("resolves visible, enabled, and required independently", () => {
    const field = {
      id: "A000000000000008",
      key: "state",
      label: "State",
      type: "text",
      visible_when: { field: "country", op: "eq", value: "us" },
      enabled_when: { field: "confirmed", op: "eq", value: true },
      required_when: { field: "kind", op: "eq", value: "business" },
    } satisfies FieldDraft;
    expect(resolveFieldState(field, { country: "us", confirmed: true, kind: "business" })).toEqual({
      visible: true,
      enabled: true,
      required: true,
    });
    expect(resolveFieldState(field, { country: "ca", confirmed: true, kind: "business" })).toEqual({
      visible: false,
      enabled: false,
      required: false,
    });
  });
});
