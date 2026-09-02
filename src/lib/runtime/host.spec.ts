import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { specFromText } from "./serialize.ts";

describe("builder.run host", () => {
  it("materialises a type into records, views, and a triggered flow", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
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

  it("walks the freelance CRM mould-and-use loop", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const org = await host.create("organisation", { name: "Acme" });
    const project = await host.create("project", {
      name: "Website redesign",
      client: org.id,
      status: "active",
      budget: 8000,
    });
    const invoice = await host.create("invoice", {
      number: "INV-1",
      project: project.id,
      amount: 8000,
      status: "sent",
    });
    await host.invoke("mark_invoice_paid", { invoice: invoice.id });
    const paid = await host.getRecord("invoice", invoice.id);
    expect(paid?.status).toBe("paid");
    expect(paid?.paid_at).toBeTruthy();
    await host.upsertField("project", {
      key: "priority",
      type: "enum",
      values: ["low", "medium", "high"],
    });
    await host.update("project", project.id, { priority: "high" });
    const moulded = await host.getRecord("project", project.id);
    expect(moulded?.priority).toBe("high");
    const info = await host.inspectStore("local");
    expect(
      info.tables
        .find((table) => table.name === "project")
        ?.columns.some((column) => column.startsWith("priority ")),
    ).toBe(true);
  });

  it("keeps actors as the permission subject", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const actor = host.actor();
    expect(actor.kind).toBe("human");
    expect(actor.roles).toContain("admin");
    await host.upsertType({
      key: "note",
      fields: [{ id: "fld_n", key: "title", label: "Title", type: "text" }] as never,
    });
    const record = await host.create("note", { title: "Hello" });
    expect(record.created_by).toBe(actor.id);
  });

  it("updates the local person and names a space", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const actor = await host.updateActor({ name: "Ada", email: "ada@example.com" });
    expect(actor.name).toBe("Ada");
    expect(actor.email).toBe("ada@example.com");
    await host.renameSpace("Studio Space");
    expect(host.space().name).toBe("Studio Space");
    const app = await host.createApp("Pipeline", "freelance_crm");
    expect(app.name).toBe("Pipeline");
    expect(host.app().spec.types.some((type) => type.key === "invoice")).toBe(true);
  });

  it("deletes an app and leaves a blank one if it was the last", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.createApp("Pipeline", "freelance_crm");
    const keep = await host.createApp("Notes");
    await host.deleteApp(host.apps().find((item) => item.name === "Pipeline")!.id);
    expect(host.apps().map((item) => item.name)).toEqual(["Home", "Notes"]);
    expect(host.app().id).toBe(keep.id);
    await host.deleteApp(keep.id);
    await host.deleteApp(host.app().id);
    expect(host.apps()).toHaveLength(1);
    expect(host.app().name).toBe("Home");
    expect(host.resolvedSpec().types.some((type) => !type.expose)).toBe(false);
  });

  it("treats apps as spaces created by the account actor", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    expect(host.space().name).toBe("Personal Space");
    expect(host.app().name).toBe("Home");
    expect(host.app().createdBy).toBe(host.actor().id);
    expect(host.space().spec.types.some((type) => type.key === "organisation")).toBe(false);
    expect(host.apps().map((item) => item.name)).toEqual(["Home"]);
    await host.loadSample("freelance_crm");
    expect(host.space().spec.types.some((type) => type.key === "organisation" && type.expose)).toBe(
      true,
    );
    expect(host.app().spec.types.some((type) => type.key === "organisation")).toBe(false);
    expect(host.app().spec.types.some((type) => type.key === "invoice")).toBe(true);
    const shared = await host.inspectStore("shared");
    const local = await host.inspectStore("local");
    expect(shared.database).toBe(`space-${host.space().id}`);
    expect(local.database).toBe(`space-${host.app().id}`);
    expect(shared.tables.some((table) => table.name === "organisation")).toBe(true);
    expect(local.tables.some((table) => table.name === "invoice")).toBe(true);
    expect(host.snapshot().catalog.database).toBe("catalog");
    expect(
      host
        .apps()
        .map((item) => item.name)
        .sort(),
    ).toEqual(["Freelance CRM", "Home"]);
    const other = await host.createSpace("Client Space");
    expect(other.name).toBe("Client Space");
    expect(host.app().name).toBe("Home");
    expect(host.app().createdBy).toBe(host.actor().id);
    expect(
      host
        .snapshot()
        .spaces.map((item) => item.name)
        .sort(),
    ).toEqual(["Client Space", "Personal Space"]);
  });
});
