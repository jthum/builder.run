import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { resetMemorySlot } from "./persist.ts";
import { specFromText } from "./serialize.ts";

describe("builder.run host", () => {
  it("materialises a type into records, views, and a triggered flow", async () => {
    expect.hasAssertions();
    resetMemorySlot();
    const host = await Host.open({ backend: "memory", persist: false });
    await host.upsertType({
      key: "invoice",
      fields: [
        { id: "fld_n", key: "number", label: "Number", type: "text", required: true },
        {
          id: "fld_s",
          key: "status",
          label: "Status",
          type: "enum",
          values: ["draft", "paid"],
          default: "draft",
        },
        { id: "fld_p", key: "paid_at", label: "Paid at", type: "date" },
      ] as never,
    });
    await host.upsertFlow({
      key: "mark_paid",
      expose: ["ui", "agent"],
      input: { invoice: "ref(invoice)" },
      steps: [{ set: { "invoice.status": "paid" } }],
    });
    await host.upsertFlow({
      key: "stamp_paid",
      trigger: { when: "invoice.status.changed" },
      when: "invoice.status == paid",
      steps: [{ set: { "invoice.paid_at": "now" } }],
    });
    const created = await host.create("invoice", { number: "INV-1" });
    expect(created.status).toBe("draft");
    await host.invoke("mark_paid", { invoice: created.id });
    const paid = await host.getRecord("invoice", created.id);
    expect(paid?.status).toBe("paid");
    expect(paid?.paid_at).toBeTruthy();
    const spec = host.resolvedSpec();
    expect(spec.views.some((view) => view.source === "invoice")).toBe(true);
    expect(spec.forms.some((form) => form.type === "invoice")).toBe(true);
  });

  it("parses a compact authored spec", () => {
    expect.hasAssertions();
    const spec = specFromText(`
types:
  task:
    fields:
      title: text
      done: boolean
`);
    expect(spec.types[0]?.key).toBe("task");
    expect(spec.types[0]?.fields.map((field) => field.key)).toEqual(["title", "done"]);
  });

  it("keeps actors as the permission subject", async () => {
    expect.hasAssertions();
    resetMemorySlot();
    const host = await Host.open({ backend: "memory", persist: false });
    const actor = host.actor();
    expect(actor.kind).toBe("human");
    expect(actor.roles).toContain("admin");
    const record = await host.create("organisation", { name: "Acme" });
    expect(record.created_by).toBe(actor.id);
  });
});
