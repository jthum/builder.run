import { describe, expect, it } from "vite-plus/test";
import { Host } from "$lib/runtime/host.ts";
import { applicableFlows } from "./relations.ts";

describe("record actions", () => {
  it("seeds template records and keeps buttons on the matching type", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const spec = host.resolvedSpec();
    const organisations = await host.listRecords("organisation");
    const projects = await host.listRecords("project");
    const invoices = await host.listRecords("invoice");
    expect(organisations.some((row) => row.name === "Acme Ltd")).toBe(true);
    expect(projects.some((row) => row.name === "Website redesign")).toBe(true);
    const sent = invoices.find((row) => row.status === "sent");
    expect(sent).toBeTruthy();
    expect(applicableFlows(spec, "project", projects[0]!).map((flow) => flow.key)).not.toContain(
      "mark_invoice_paid",
    );
    expect(applicableFlows(spec, "invoice", sent!).map((flow) => flow.key)).toContain(
      "mark_invoice_paid",
    );
  });
});
