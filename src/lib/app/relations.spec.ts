import { describe, expect, it } from "vite-plus/test";
import { Host } from "$lib/runtime/host.ts";
import { applicableWorkflows, workflowsForForm } from "./relations.ts";

describe("record actions", () => {
  it("seeds template records and keeps buttons on the matching type", async () => {
    expect.hasAssertions();
    const host = await Host.open();
    await host.loadSample("freelance_crm");
    const spec = host.resolvedSpec();
    const organisations = await host.listRecords("organisation");
    const projects = await host.listRecords("project");
    const invoices = await host.listRecords("invoice");
    expect(organisations.some((row) => row.name === "Acme Ltd")).toBe(true);
    expect(projects.some((row) => row.name === "Website redesign")).toBe(true);
    const sent = invoices.find((row) => row.status === "sent");
    expect(sent).toBeTruthy();
    expect(
      applicableWorkflows(spec, "project", projects[0]!).map((workflow) => workflow.key),
    ).not.toContain("mark_invoice_paid");
    expect(applicableWorkflows(spec, "invoice", sent!).map((workflow) => workflow.key)).toContain(
      "mark_invoice_paid",
    );
  });
});

describe("workflow relationships", () => {
  it("finds workflows explicitly connected to a form", async () => {
    const host = await Host.open();
    await host.upsertForm({
      key: "contact_us",
      mode: "standalone",
      inputs: { name: { type: "text" } },
    });
    await host.upsertWorkflow({
      key: "capture_contact",
      trigger: { key: "form.submitted", config: { form: "contact_us" } },
      input: { values: { value: "object" } },
      steps: [],
    });
    await host.upsertWorkflow({
      key: "other_form",
      trigger: { key: "form.submitted", config: { form: "another_form" } },
      input: { values: { value: "object" } },
      steps: [],
    });

    expect(workflowsForForm(host.resolvedSpec(), "contact_us").map((item) => item.key)).toEqual([
      "capture_contact",
    ]);
  });
});
