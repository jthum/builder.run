import { describe, expect, it } from "vite-plus/test";
import {
  BROWSER_LOCAL_AUTOMATION_PROFILE,
  checkAutomationCompatibility,
  validateAutomation,
} from "./index.ts";

describe("automation language", () => {
  it("validates structured branches without graph ceremony", () => {
    const result = validateAutomation({
      key: "route_submission",
      label: "Route submission",
      trigger: { key: "submission.changed" },
      steps: [
        {
          gate: {
            predicate: {
              all: [
                { op: "context.compare", path: "vars.submission.score", operator: "gte", value: 4 },
                { not: { op: "context.empty", path: "vars.submission.owner" } },
              ],
            },
            pass: [{ effect: { key: "records.set", params: { values: { status: "accepted" } } } }],
            fail: [{ effect: { key: "records.set", params: { values: { status: "rejected" } } } }],
          },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("separates validity from runtime compatibility", () => {
    const workflow = {
      key: "approval",
      label: "Approval",
      steps: [
        {
          wait: {
            signal: "approved",
            timeout: "1 day",
            on_signal: [{ effect: { key: "null" } }],
          },
        },
      ],
    };

    expect(validateAutomation(workflow).valid).toBe(true);
    const compatibility = checkAutomationCompatibility(
      workflow as never,
      BROWSER_LOCAL_AUTOMATION_PROFILE,
    );
    expect(compatibility.compatible).toBe(false);
    expect(compatibility.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capability: "signals", support: "unsupported" }),
        expect.objectContaining({ capability: "durable_waits", support: "emulated" }),
      ]),
    );
  });

  it("reports malformed composition but preserves unresolved host vocabulary", () => {
    const result = validateAutomation({
      key: "custom",
      label: "Custom",
      steps: [
        { effect: { key: "vendor.unknown" } },
        { foreach: { source: "vars.items", steps: [] } },
        { effect: { key: "null" }, compute: { assign: {} } },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "effect.unresolved", severity: "warning" }),
        expect.objectContaining({ code: "foreach.source", severity: "error" }),
        expect.objectContaining({ code: "step.kind", severity: "error" }),
      ]),
    );
  });

  it("rejects the removed workflow shape instead of carrying a compatibility path", () => {
    const result = validateAutomation({
      key: "old",
      label: "Old",
      input: { invoice: "ref(invoice)" },
      when: "invoice.status == sent",
      steps: [{ set: { "invoice.status": "paid" } }],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["input.object", "step.kind"]),
    );
  });
});
