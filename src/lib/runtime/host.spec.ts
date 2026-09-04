import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { groupChart } from "./chart-data.ts";
import { specFromText } from "./serialize.ts";
import { createNodeGateway } from "./sql-node.ts";

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
      score:
        type: number
        presentation: rating
        max: 5
`);
    expect(spec.types[0]?.key).toBe("task");
    expect(spec.types[0]?.fields.map((field) => field.key)).toEqual(["title", "done", "score"]);
    expect(spec.types[0]?.fields.at(-1)).toMatchObject({
      type: "number",
      presentation: "rating",
      variant: "segments",
      max: 5,
    });
  });

  it("stores ratings as validated numbers", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "review",
      fields: [
        {
          id: "fld_score",
          key: "score",
          label: "Score",
          type: "number",
          presentation: "rating",
          variant: "segments",
          max: 10,
        },
      ] as never,
    });
    const review = await host.create("review", { score: 8 });
    expect(review.score).toBe(8);
    await expect(host.create("review", { score: 11 })).rejects.toThrow(
      "Score must be a whole number from 1 to 10",
    );
    await expect(host.create("review", { score: 7.5 })).rejects.toThrow(
      "Score must be a whole number from 1 to 10",
    );
    await host.upsertField("review", {
      key: "score",
      type: "number",
      presentation: undefined,
    });
    expect(host.resolvedSpec().types[0]?.fields[0]).not.toHaveProperty("presentation");
    expect(host.resolvedSpec().types[0]?.fields[0]).not.toHaveProperty("variant");
    expect(host.resolvedSpec().types[0]?.fields[0]).not.toHaveProperty("max");
  });

  it("stores explicit badge semantics for enum values", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "submission", fields: [] });
    const stage = await host.upsertField("submission", {
      key: "stage",
      type: "enum",
      values: ["submitted", "winner", "rejected"],
      presentation: "badge",
      value_semantics: {
        submitted: "neutral",
        winner: "success",
        rejected: "danger",
      },
    });
    expect(stage).toMatchObject({
      presentation: "badge",
      value_semantics: {
        submitted: "neutral",
        winner: "success",
        rejected: "danger",
      },
    });
    await expect(
      host.upsertField("submission", {
        key: "stage",
        type: "enum",
        values: ["submitted", "winner", "rejected"],
        presentation: "badge",
        value_semantics: { missing: "warning" },
      }),
    ).rejects.toThrow('Badge semantic value "missing" is not a choice');
    await host.upsertField("submission", {
      key: "stage",
      type: "enum",
      presentation: undefined,
    });
    expect(host.resolvedSpec().types[0]?.fields[0]).not.toHaveProperty("presentation");
    expect(host.resolvedSpec().types[0]?.fields[0]).not.toHaveProperty("value_semantics");
  });

  it("enforces field identity rules on direct field changes", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "review", fields: [] });
    const score = await host.upsertField("review", {
      key: " Review Score ",
      label: "   ",
      type: "number",
    });
    expect(score).toMatchObject({ key: "review_score", label: "Review Score" });
    await expect(host.upsertField("review", { key: " ", type: "text" })).rejects.toThrow(
      "Field needs a non-empty key or label",
    );
    await expect(host.upsertField("review", { key: "created_at", type: "date" })).rejects.toThrow(
      'Field key "created_at" is reserved',
    );
    await host.upsertField("review", { key: "notes", type: "text" });
    await expect(host.renameField("review", "notes", "Review score")).rejects.toThrow(
      'Field key "review_score" already exists',
    );
  });

  it("derives and reorders a grouped review leaderboard without mutating submissions", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "submission",
      fields: [{ key: "name", label: "Name", type: "text", required: true }] as never,
    });
    await host.upsertType({
      key: "review",
      fields: [
        { key: "submission", label: "Submission", type: "reference", target: "submission" },
        { key: "webmcp_leverage", label: "WebMCP leverage", type: "number", required: true },
        { key: "execution", label: "Execution", type: "number", required: true },
        { key: "impact", label: "Impact", type: "number", required: true },
        { key: "creativity", label: "Creativity", type: "number", required: true },
      ] as never,
    });
    const submissionA = await host.create("submission", { name: "Submission A" });
    const submissionB = await host.create("submission", { name: "Submission B" });
    await host.create("review", {
      submission: submissionA.id,
      webmcp_leverage: 5,
      execution: 5,
      impact: 4,
      creativity: 4,
    });
    await host.create("review", {
      submission: submissionA.id,
      webmcp_leverage: 4,
      execution: 5,
      impact: 5,
      creativity: 4,
    });
    const reviewB = await host.create("review", {
      submission: submissionB.id,
      webmcp_leverage: 3,
      execution: 4,
      impact: 3,
      creativity: 4,
    });
    const beforeA = await host.getRecord("submission", submissionA.id);
    const beforeB = await host.getRecord("submission", submissionB.id);
    const view = await host.upsertView({
      key: "leaderboard",
      source: "review",
      group_by: "submission",
      measures: {
        review_count: { op: "count" },
        webmcp_score: { op: "avg", field: "webmcp_leverage" },
        execution_score: { op: "avg", field: "execution" },
        impact_score: { op: "avg", field: "impact" },
        creativity_score: { op: "avg", field: "creativity" },
        overall_score: {
          op: "avg",
          fields: ["webmcp_leverage", "execution", "impact", "creativity"],
        },
      },
      order_by: { overall_score: "desc" },
    });

    expect(view.fields).toEqual([
      "submission",
      "review_count",
      "webmcp_score",
      "execution_score",
      "impact_score",
      "creativity_score",
      "overall_score",
    ]);
    const initial = await host.queryView("leaderboard");
    expect(initial.map((row) => row.submission)).toEqual(["Submission A", "Submission B"]);
    expect(initial[0]?.id).toBe(submissionA.id);
    expect(initial[0]).toMatchObject({
      review_count: 2,
      webmcp_score: 4.5,
      execution_score: 5,
      impact_score: 4.5,
      creativity_score: 4,
      overall_score: 4.5,
    });
    expect(initial[1]?.overall_score).toBe(3.5);

    await host.update("review", reviewB.id, { webmcp_leverage: 5 });
    const updated = await host.queryView("leaderboard");
    expect(updated.map((row) => row.submission)).toEqual(["Submission A", "Submission B"]);
    expect(updated[1]).toMatchObject({ webmcp_score: 5, overall_score: 4 });
    expect(groupChart(updated, { category: "submission", value: "overall_score" })).toMatchObject({
      categories: [{ label: "Submission A" }, { label: "Submission B" }],
      series: [{ values: [4.5, 4] }],
    });
    expect(await host.getRecord("submission", submissionA.id)).toEqual(beforeA);
    expect(await host.getRecord("submission", submissionB.id)).toEqual(beforeB);
    expect(host.resolvedSpec().flows).toEqual([]);
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
    expect(host.space().id.startsWith("spc_")).toBe(false);
    expect(shared.database.includes("spc_")).toBe(false);
    const unpaid = await host.queryView("unpaid_invoices");
    expect(unpaid.every((row) => row.status === "sent")).toBe(true);
    const paid = await host.queryView("unpaid_invoices", { status: "paid" });
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((row) => row.status === "paid")).toBe(true);
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

  it("orders a view by more than one field", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    await host.create("invoice", { number: "INV-105", amount: 500, status: "sent" });
    await host.create("invoice", { number: "INV-106", amount: 9000, status: "paid" });
    await host.upsertView({
      key: "by_status_amount",
      label: "By status then amount",
      source: "invoice",
      fields: ["number", "status", "amount"],
      order_by: { status: "asc", amount: "desc" },
      implicit: false,
    });
    const rows = await host.queryView("by_status_amount");
    expect(rows.map((row) => [row.status, row.amount])).toEqual([
      ["paid", 9000],
      ["paid", 1200],
      ["sent", 8000],
      ["sent", 500],
    ]);
  });

  it("accepts nested group blocks and a null folder on upsert_page", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "client",
      fields: [{ key: "name", type: "text", label: "Name" }] as never,
    });
    const page = await host.upsertPage({
      key: "clients",
      label: "Clients",
      folder: null as never,
      blocks: [
        {
          kind: "group",
          columns: 1,
          blocks: [{ kind: "widget", widget: "table", values: { view: "client_list" } }],
        },
      ],
    });
    expect(page.folder).toBeUndefined();
    expect(page.icon).toBe("table");
    expect(page.blocks).toEqual([
      {
        kind: "group",
        columns: 1,
        blocks: [{ kind: "widget", widget: "table", values: { view: "client_list" } }],
      },
    ]);

    const updated = await host.upsertPage({
      key: "clients",
      blocks: [{ kind: "widget", widget: "heading", values: { title: "Clients" } }],
    });
    expect(updated.icon).toBe("table");
  });

  it("rejects supplied invalid page icons instead of silently inferring one", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await expect(host.upsertPage({ key: "blank", icon: "" as never })).rejects.toThrow(
      'Invalid page icon ""',
    );
    await expect(host.upsertPage({ key: "invalid", icon: "sparkles" as never })).rejects.toThrow(
      'Invalid page icon "sparkles"',
    );
  });

  it("accepts upsert_page when a group's inner blocks is a single object", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const page = await host.upsertPage({
      key: "diag_nested",
      label: "Diagnostic Nested",
      path: "/diag-nested",
      blocks: [
        {
          kind: "group",
          columns: 1,
          blocks: { kind: "widget", widget: "heading", values: { title: "Diagnostics" } } as never,
        },
      ],
    });
    expect(page.blocks).toEqual([
      {
        kind: "group",
        columns: 1,
        blocks: [{ kind: "widget", widget: "heading", values: { title: "Diagnostics" } }],
      },
    ]);
  });

  it("validates widget contracts before replacing a full spec", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "note", fields: { title: "text" } });
    await expect(
      host.applySpec({
        types: {
          task: {
            fields: {
              status: { type: "enum", values: ["todo", "done"] },
              points: "number",
            },
          },
        },
        pages: {
          board: {
            blocks: [
              {
                kind: "widget",
                widget: "kanban",
                values: { view: "task_list", field: "points" },
              },
            ],
          },
        },
      }),
    ).rejects.toThrow('Widget "kanban" values.field cannot be "points". Valid options: status.');
    expect(host.resolvedSpec().types.some((type) => type.key === "note")).toBe(true);
    expect(host.resolvedSpec().types.some((type) => type.key === "task")).toBe(false);
  });

  it("updates page metadata without replacing its blocks", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const blocks = [
      {
        kind: "group" as const,
        columns: 1,
        blocks: [{ kind: "widget" as const, widget: "heading", values: { title: "Overview" } }],
      },
    ];
    await host.upsertPage({ key: "overview", label: "Overview", blocks });

    const page = await host.upsertPage({
      key: "overview",
      label: "Project overview",
      icon: "dashboard",
      folder: "Projects",
    });

    expect(page.label).toBe("Project overview");
    expect(page.icon).toBe("dashboard");
    expect(page.folder).toBe("Projects");
    expect(page.blocks).toEqual(blocks);
  });

  it("creates a type from inline fields as an array or a map, and keeps them on later upserts", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "client",
      fields: {
        name: { type: "text", label: "Name", required: true },
        industry: "text",
      },
    });
    expect(
      host
        .resolvedSpec()
        .types.find((type) => type.key === "client")
        ?.fields.map((field) => field.key),
    ).toEqual(["name", "industry"]);
    await host.upsertType({ key: "client", label: "Clients" });
    const kept = host.resolvedSpec().types.find((type) => type.key === "client");
    expect(kept?.label).toBe("Clients");
    expect(kept?.fields.map((field) => field.key)).toEqual(["name", "industry"]);
    await host.upsertType({
      key: "project",
      fields: [
        { key: "name", type: "text" },
        { key: "client", type: "reference", target: "client" },
      ],
    });
    expect(
      host
        .resolvedSpec()
        .types.find((type) => type.key === "project")
        ?.fields.map((field) => [field.key, field.type, field.target]),
    ).toEqual([
      ["name", "text", undefined],
      ["client", "reference", "client"],
    ]);
  });

  it("exports authored forms and omits generated default forms", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "client",
      fields: { name: { type: "text" } },
    });
    expect(host.resolvedSpec().forms.some((form) => form.key === "client_create")).toBe(true);
    expect(host.exportYaml()).not.toMatch(/client_create:/);
    await host.upsertForm({
      key: "intake",
      type: "client",
      fields: ["name"],
      mode: "create",
    });
    expect(host.exportYaml()).toMatch(/intake:/);
    await host.upsertForm({
      key: "client_create",
      type: "client",
      fields: ["name"],
      mode: "create",
    });
    expect(host.exportYaml()).toMatch(/client_create:/);
  });

  it("drops old type tables when replaceSpecText replaces the spec", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "note", fields: { title: "text" } });
    await host.replaceSpecText("types:\n  gone:\n    fields:\n      x: text\n");
    expect(host.resolvedSpec().types.map((type) => type.key)).toContain("gone");
    expect(host.resolvedSpec().types.some((type) => type.key === "note")).toBe(false);
    const info = await host.inspectStore("local");
    expect(info.tables.some((table) => table.name === "note")).toBe(false);
    expect(info.tables.some((table) => table.name === "gone")).toBe(true);
  });

  it("gives the UI a copy of space and app, not the live host objects", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const snap = host.snapshot();
    expect(snap.app).not.toBe(host.app());
    expect(snap.space).not.toBe(host.space());
    const original = host.app().name;
    snap.app.name = "Mutated in the UI copy";
    expect(host.app().name).toBe(original);
  });

  it("saves exposed view filters from a reactive array", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const expose = new Proxy(["status"], {});
    const saved = await host.upsertView({
      key: "unpaid_invoices",
      expose,
      implicit: false,
    });
    expect([...(saved.expose ?? [])]).toEqual(["status"]);
  });

  it("filters a view by the current record", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const project = (await host.listRecords("project")).find(
      (row) => row.name === "Website redesign",
    );
    expect(project).toBeTruthy();
    await host.upsertView({
      key: "project_invoices",
      label: "Project invoices",
      source: "invoice",
      fields: ["number", "amount", "status"],
      where: [{ field: "project", op: "eq", value: "$record.id" }],
      implicit: false,
    });
    const rows = await host.queryView("project_invoices", undefined, {
      recordId: String(project!.id),
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.number === "INV-104")).toBe(true);
    const empty = await host.queryView("project_invoices");
    expect(empty).toEqual([]);
  });

  it("previews a draft view without saving it", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const saved = host.resolvedSpec().views.find((item) => item.key === "unpaid_invoices");
    expect(saved).toBeTruthy();
    const draft = { ...saved!, where: { status: "paid" } };
    const rows = await host.queryView(draft);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === "paid")).toBe(true);
    const still = await host.queryView("unpaid_invoices");
    expect(still.every((row) => row.status === "sent")).toBe(true);
  });

  it("wipes local data so a new host reseeds without leftover space ids", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const host = await Host.open({ gateway, persist: false });
    await host.loadSample("freelance_crm");
    const oldSpace = host.space().id;
    const oldApp = host.app().id;
    await host.resetLocalData();
    const next = await Host.open({ gateway, persist: false });
    expect(next.space().id).not.toBe(oldSpace);
    expect(next.app().id).not.toBe(oldApp);
    expect(next.space().id.startsWith("spc_")).toBe(false);
    expect(next.app().id.startsWith("spc_")).toBe(false);
    expect(next.snapshot().catalog.tables).toEqual(["actor", "kv", "space"]);
    expect(next.snapshot().stores.every((store) => !store.database.includes("spc_"))).toBe(true);
  });
});
