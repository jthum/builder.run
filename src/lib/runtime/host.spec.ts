import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { groupChart } from "./chart-data.ts";
import { specFromText } from "./serialize.ts";
import { createNodeGateway } from "./sql-node.ts";
import { CATALOG_DATABASE } from "./catalog.ts";

describe("builder.run host", () => {
  it("validates standalone forms and dispatches form submission workflows", async () => {
    const host = await Host.open();
    await host.upsertType({
      key: "lead",
      fields: {
        name: { type: "text", required: true },
        email: { type: "text", format: "email" },
      },
    });
    await host.upsertForm({
      key: "contact_us",
      label: "Contact us",
      mode: "standalone",
      inputs: [
        { key: "name", type: "text", required: true },
        { key: "email", type: "text", format: "email" },
      ] as never,
    });
    await host.upsertWorkflow({
      key: "capture_contact",
      input: { values: { value: "object" } },
      trigger: { key: "form.submitted", config: { form: "contact_us" } },
      steps: [
        {
          effect: {
            key: "records.create",
            params: {
              type: "lead",
              fields: {
                name: { $ref: "vars.values.name" },
                email: { $ref: "vars.values.email" },
              },
            },
          },
        },
      ],
    });

    await expect(
      host.submitForm("contact_us", { name: "Ada", email: "not-an-email" }),
    ).rejects.toThrow("Email must be an email address");
    await expect(
      host.submitForm("contact_us", { name: "Ada", email: "ada@example.com" }),
    ).resolves.toBeNull();
    await expect(host.listRecords("lead")).resolves.toEqual([
      expect.objectContaining({ name: "Ada", email: "ada@example.com" }),
    ]);
  });

  it("preserves standalone input identity and conditions when an input key changes", async () => {
    const host = await Host.open();
    const form = await host.upsertForm({
      key: "address",
      mode: "standalone",
      inputs: [
        { key: "country", type: "text" },
        {
          key: "state",
          type: "text",
          visible_when: { field: "country", op: "eq", value: "us" },
        },
      ],
    });
    const country = form.inputs?.[0];

    const renamed = await host.upsertForm({
      key: "address",
      inputs: form.inputs?.map((input) =>
        input.id === country?.id ? { ...input, key: "region" } : input,
      ),
    });

    expect(renamed.inputs?.[0]).toMatchObject({ id: country?.id, key: "region" });
    expect(renamed.inputs?.[1]?.visible_when).toEqual({
      field: "region",
      op: "eq",
      value: "us",
    });
  });

  it("materialises a type into records, views, and a triggered workflow", async () => {
    expect.hasAssertions();
    const host = await Host.open();
    await host.upsertType({
      key: "invoice",
      fields: [
        { id: "A00000000000000B", key: "number", label: "Number", type: "text", required: true },
        {
          id: "A00000000000000D",
          key: "status",
          label: "Status",
          type: "enum",
          values: ["draft", "paid"],
          default: "draft",
        },
        { id: "A00000000000000C", key: "paid_at", label: "Paid at", type: "date" },
      ] as never,
    });
    await host.upsertWorkflow({
      key: "mark_paid",
      expose: ["ui", "agent"],
      input: { invoice: { record: "invoice" } },
      steps: [
        {
          effect: {
            key: "records.set",
            params: { record: { $ref: "vars.invoice" }, values: { status: "paid" } },
          },
        },
      ],
    });
    await host.upsertWorkflow({
      key: "stamp_paid",
      trigger: { key: "invoice.status.changed" },
      steps: [
        {
          gate: {
            predicate: { op: "context.equals", path: "vars.invoice.status", value: "paid" },
            pass: [
              {
                effect: {
                  key: "records.set",
                  params: {
                    record: { $ref: "vars.invoice" },
                    values: { paid_at: { $ref: "meta.now" } },
                  },
                },
              },
            ],
          },
        },
      ],
    });
    const created = await host.create("invoice", { number: "INV-1" });
    expect(created.status).toBe("draft");
    await expect(host.update("invoice", created.id, { number: "" })).rejects.toThrow(
      "Number is required",
    );
    await host.invoke("mark_paid", { invoice: created.id });
    const paid = await host.getRecord("invoice", created.id);
    expect(paid?.status).toBe("paid");
    expect(paid?.paid_at).toBeTruthy();
    const spec = host.resolvedSpec();
    expect(spec.views.some((view) => view.source === "invoice")).toBe(true);
    expect(spec.forms.some((form) => form.type === "invoice")).toBe(true);
  });

  it("keeps generated resources out of authored app state", async () => {
    const host = await Host.open();
    await host.upsertType({ key: "note", fields: { title: "text" } });

    expect(host.app().spec.views.some((view) => view.implicit)).toBe(false);
    expect(host.app().spec.forms.some((form) => form.implicit)).toBe(false);
    expect(host.app().spec.pages.some((page) => page.implicit)).toBe(false);
    expect(host.resolvedSpec().views).toContainEqual(
      expect.objectContaining({ key: "note_list", implicit: true, fields: ["title"] }),
    );

    await host.upsertField("note", { key: "summary", type: "text" });
    expect(host.resolvedSpec().views).toContainEqual(
      expect.objectContaining({ key: "note_list", fields: ["title", "summary"] }),
    );
  });

  it("runs structured results, gates, loops, and deterministic branches", async () => {
    const host = await Host.open();
    await host.upsertType({
      key: "invoice",
      fields: [
        { id: "A000000000000001", key: "number", label: "Number", type: "text" },
        {
          id: "A000000000000002",
          key: "status",
          label: "Status",
          type: "enum",
          values: ["draft", "paid"],
          default: "draft",
        },
      ] as never,
    });
    const first = await host.create("invoice", { number: "INV-1" });
    const second = await host.create("invoice", { number: "INV-2" });
    await host.upsertWorkflow({
      key: "bulk_mark_paid",
      input: { status: { value: "text" } },
      steps: [
        {
          effect: {
            key: "records.query",
            params: { type: "invoice" },
            as: "invoices",
          },
        },
        {
          compute: {
            assign: {
              invoices_copy: { $ref: "vars.invoices" },
              marker: "before",
            },
          },
        },
        {
          compute: {
            assign: {
              marker: "after",
              observed_marker: { $ref: "vars.marker" },
            },
          },
        },
        {
          foreach: {
            source: { $ref: "vars.invoices_copy" },
            as: "invoice",
            steps: [
              {
                gate: {
                  predicate: {
                    op: "context.equals",
                    path: "vars.invoice.status",
                    value: "draft",
                  },
                  pass: [
                    {
                      effect: {
                        key: "records.set",
                        params: {
                          record: { $ref: "vars.invoice" },
                          values: { status: { $ref: "vars.status" } },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          parallel: {
            branches: [
              { steps: [{ compute: { assign: { first_branch: true } } }] },
              { steps: [{ compute: { assign: { second_branch: true } } }] },
            ],
          },
        },
      ],
    });

    const run = await host.invoke("bulk_mark_paid", { status: "paid" });
    expect((await host.getRecord("invoice", first.id))?.status).toBe("paid");
    expect((await host.getRecord("invoice", second.id))?.status).toBe("paid");
    expect(run.output).toMatchObject({
      first_branch: true,
      second_branch: true,
      marker: "after",
      observed_marker: "before",
    });
  });

  it("enforces type lifecycles and dispatches named transition triggers", async () => {
    const host = await Host.open();
    await host.upsertType({
      key: "ticket",
      fields: [
        {
          key: "status",
          type: "enum",
          required: true,
          values: ["new", "active", "resolved"],
        },
        { key: "closed", type: "boolean" },
      ],
      lifecycle: {
        field: "status",
        initial: "new",
        terminal: ["resolved"],
        transitions: [
          { key: "start", label: "Start", from: ["new"], to: "active" },
          { key: "resolve", label: "Resolve", from: ["active"], to: "resolved" },
        ],
      },
    } as never);
    await host.upsertWorkflow({
      key: "mark_closed",
      input: { ticket: { record: "ticket" } },
      trigger: { key: "ticket.resolve.transitioned" },
      steps: [
        {
          effect: {
            key: "records.set",
            params: { record: { $ref: "vars.ticket" }, values: { closed: true } },
          },
        },
      ],
    });

    const ticket = await host.create("ticket", {});
    expect(ticket.status).toBe("new");
    await expect(host.create("ticket", { status: "active" })).rejects.toThrow(
      "must start in lifecycle state new",
    );
    const active = await host.transition("ticket", ticket.id, "start");
    expect(active.status).toBe("active");
    await expect(host.update("ticket", ticket.id, { status: "new" })).rejects.toThrow(
      "Invalid Ticket lifecycle transition from active to new",
    );
    await host.transition("ticket", ticket.id, "resolve");
    expect(await host.getRecord("ticket", ticket.id)).toMatchObject({
      status: "resolved",
      closed: true,
    });
    await expect(host.transition("ticket", ticket.id, "start")).rejects.toThrow(
      "is not available from resolved",
    );
  });

  it("compensates completed effects when a later step fails", async () => {
    const host = await Host.open();
    await host.upsertType({ key: "note", fields: { title: "text" } });
    await host.upsertWorkflow({
      key: "create_then_fail",
      steps: [
        {
          effect: {
            key: "records.create",
            params: { type: "note", fields: { title: "Temporary" } },
            as: "created",
            compensate: {
              key: "records.delete",
              params: { record: { $ref: "vars.created" } },
            },
          },
        },
        {
          effect: {
            key: "records.set",
            params: { record: { $ref: "vars.missing" }, values: { title: "Never" } },
          },
        },
      ],
    });

    await expect(host.invoke("create_then_fail")).rejects.toThrow(
      "records.set needs a record binding",
    );
    expect(await host.queryView("note_list")).toEqual([]);
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
    const host = await Host.open();
    await host.upsertType({
      key: "review",
      fields: [
        {
          id: "A000000000000003",
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

  it("enforces reusable field validation and conditional requirements", async () => {
    expect.hasAssertions();
    const host = await Host.open();
    await host.upsertType({
      key: "contact",
      fields: [
        { key: "country", type: "enum", values: ["us", "ca"], required: true },
        {
          key: "email",
          type: "text",
          format: "email",
          validation: { max_length: 40 },
        },
        {
          key: "state",
          type: "text",
          visible_when: { field: "country", op: "eq", value: "us" },
          required_when: { field: "country", op: "eq", value: "us" },
          hidden_value: "clear",
        },
      ] as never,
    });

    await expect(host.create("contact", { country: "us" })).rejects.toThrow("State is required");
    await expect(host.create("contact", { country: "ca", email: "not-an-email" })).rejects.toThrow(
      "Email must be an email address",
    );
    const contact = await host.create("contact", {
      country: "ca",
      email: "person@example.com",
      state: "Should be cleared",
    });
    expect(contact.state).toBeNull();

    await host.renameField("contact", "country", "nation");
    expect(
      host.resolvedSpec().types[0]?.fields.find((field) => field.key === "state"),
    ).toMatchObject({
      visible_when: { field: "nation", op: "eq", value: "us" },
      required_when: { field: "nation", op: "eq", value: "us" },
    });
    await host.deleteField("contact", "nation");
    expect(
      host.resolvedSpec().types[0]?.fields.find((field) => field.key === "state"),
    ).not.toHaveProperty("visible_when");
  });

  it("rewrites authored field references and blocks destructive dangling references", async () => {
    const host = await Host.open();
    await host.upsertType({
      key: "project",
      fields: { name: "text", budget: "number" },
    });
    await host.upsertView({
      key: "projects",
      source: "project",
      fields: ["name", "budget"],
      where: [{ field: "name", op: "not_empty" }],
    });
    await host.upsertForm({
      key: "project_form",
      type: "project",
      fields: ["name", "budget"],
      mode: "create",
    });

    await host.renameField("project", "name", "title");
    expect(host.app().spec.views.find((view) => view.key === "projects")).toMatchObject({
      fields: ["title", "budget"],
      where: [{ field: "title", op: "not_empty" }],
    });
    expect(host.app().spec.forms.find((form) => form.key === "project_form")?.fields).toEqual([
      "title",
      "budget",
    ]);
    await expect(host.deleteField("project", "title")).rejects.toThrow(
      'Cannot delete field "project.title" because it is used by',
    );
    await expect(host.deleteType("project")).rejects.toThrow(
      'Cannot delete type "project" because it is used by',
    );
  });

  it("keeps references to shared fields coherent across apps", async () => {
    const host = await Host.open();
    await host.upsertType({ key: "client", expose: true, fields: { name: "text" } });
    await host.upsertView({ key: "clients", source: "client", fields: ["name"] });
    await host.createApp("Other app");
    await host.upsertView({ key: "client_directory", source: "client", fields: ["name"] });

    await host.renameField("client", "name", "display_name");
    expect(host.apps().map((app) => app.spec.views.flatMap((view) => view.fields))).toEqual(
      expect.arrayContaining([["display_name"], ["display_name"]]),
    );
    expect(host.fieldReferences("client", "display_name")).toHaveLength(2);
  });

  it("renames type references while preserving explicitly authored resource keys", async () => {
    const host = await Host.open();
    const type = await host.upsertType({ key: "project", fields: { name: "text" } });
    await host.upsertView({ key: "active_projects", source: "project", fields: ["name"] });
    await host.upsertForm({
      key: "project_intake",
      type: "project",
      fields: ["name"],
      mode: "create",
    });
    await host.upsertWorkflow({
      key: "touch_project",
      input: { project: { record: "project" } },
      trigger: { key: "project.name.changed" },
      steps: [
        {
          effect: {
            key: "records.set",
            params: { record: { $ref: "vars.project" }, values: { name: "Touched" } },
          },
        },
      ],
    });
    await host.upsertPage({
      key: "project_overview",
      blocks: [
        { kind: "widget", widget: "table", values: { view: "project_list" } },
        { kind: "widget", widget: "form", values: { form: "project_create" } },
      ],
    });

    const renamed = await host.renameType("project", "engagement");
    expect(renamed.id).toBe(type.id);
    expect(host.app().spec.views).toContainEqual(
      expect.objectContaining({ key: "active_projects", source: "engagement" }),
    );
    expect(host.app().spec.forms).toContainEqual(
      expect.objectContaining({ key: "project_intake", type: "engagement" }),
    );
    expect(host.app().spec.workflows).toContainEqual(
      expect.objectContaining({
        key: "touch_project",
        input: { project: { record: "engagement" } },
        trigger: { key: "engagement.name.changed" },
      }),
    );
    expect(host.app().spec.pages.find((page) => page.key === "project_overview")?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocks: [expect.objectContaining({ values: { view: "engagement_list" } })],
        }),
        expect.objectContaining({
          blocks: [expect.objectContaining({ values: { form: "engagement_create" } })],
        }),
      ]),
    );
    expect(host.resolvedSpec().views.some((view) => view.key === "engagement_list")).toBe(true);
    expect(host.resolvedSpec().views.some((view) => view.key === "project_list")).toBe(false);
  });

  it("renames a shared type across every consuming app", async () => {
    const host = await Host.open();
    const type = await host.upsertType({ key: "client", expose: true, fields: { name: "text" } });
    await host.upsertView({ key: "clients", source: "client", fields: ["name"] });
    await host.createApp("Other app");
    await host.upsertView({ key: "directory", source: "client", fields: ["name"] });

    const renamed = await host.renameType("client", "customer");
    expect(renamed).toMatchObject({ id: type.id, key: "customer", expose: true });
    expect(
      host
        .apps()
        .flatMap((app) => app.spec.views)
        .map((view) => view.source),
    ).toEqual(expect.arrayContaining(["customer", "customer"]));
    expect(host.space().spec.types.some((item) => item.key === "client")).toBe(false);
    expect(host.space().spec.types.some((item) => item.key === "customer")).toBe(true);
  });

  it("rejects conflicting type keys before changing storage", async () => {
    const host = await Host.open();
    await host.upsertType({ key: "project", fields: { name: "text" } });
    await host.upsertType({ key: "engagement", fields: { title: "text" } });

    await expect(host.renameType("project", "engagement")).rejects.toThrow(
      'Type key "engagement" is already used',
    );
    expect(host.resolvedSpec().types.map((type) => type.key)).toEqual(
      expect.arrayContaining(["project", "engagement"]),
    );
  });

  it("stores explicit badge semantics for enum values", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open();
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
    const host = await Host.open();
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
    expect(host.resolvedSpec().workflows).toEqual([]);
  });

  it("walks the freelance CRM mould-and-use loop", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open();
    const actor = host.actor();
    expect(actor.kind).toBe("human");
    expect(actor.roles).toContain("admin");
    await host.upsertType({
      key: "note",
      fields: [{ id: "A00000000000000B", key: "title", label: "Title", type: "text" }] as never,
    });
    const record = await host.create("note", { title: "Hello" });
    expect(record.created_by).toBe(actor.id);
  });

  it("updates the local person and names a space", async () => {
    expect.hasAssertions();
    const host = await Host.open();
    const actor = await host.updateActor({ name: "Ada", email: "ada@example.com" });
    expect(actor.name).toBe("Ada");
    expect(actor.email).toBe("ada@example.com");
    await host.renameSpace("Studio Space");
    expect(host.space().name).toBe("Studio Space");
    expect(host.space().appearance?.accent).toBe("blue");
    await host.updateSpaceAppearance("violet");
    expect(host.space().appearance?.accent).toBe("violet");
    const app = await host.createApp("Pipeline", "freelance_crm");
    expect(app.name).toBe("Pipeline");
    expect(host.app().spec.types.some((type) => type.key === "invoice")).toBe(true);
    await host.renameApp("Client Pipeline");
    expect(host.app().name).toBe("Client Pipeline");
    expect(host.app().spec.label).toBe("Client Pipeline");
  });

  it("persists space appearance across runtime instances", async () => {
    const gateway = createNodeGateway();
    const host = await Host.open({ gateway });
    await host.updateSpaceAppearance("violet");
    const reloaded = await Host.open({ gateway });
    expect(reloaded.space().appearance?.accent).toBe("violet");
  });

  it("rejects and does not publish a mutation when catalog persistence fails", async () => {
    const base = createNodeGateway();
    let rejectWrites = false;
    const gateway = {
      backend: base.backend,
      async open(name: string) {
        const connection = await base.open(name);
        if (name !== CATALOG_DATABASE) return connection;
        return {
          exec(sql: string, params?: unknown[]) {
            if (rejectWrites && sql === "BEGIN") throw new Error("catalog unavailable");
            return connection.exec(sql, params);
          },
          query: connection.query.bind(connection),
          close: connection.close.bind(connection),
        };
      },
      wipe: () => base.wipe(),
    };
    const host = await Host.open({ gateway });
    let published = 0;
    host.subscribe(() => published++);
    rejectWrites = true;
    await expect(host.upsertType({ key: "note", fields: { title: "text" } })).rejects.toThrow(
      "catalog unavailable",
    );
    expect(host.resolvedSpec().types.some((type) => type.key === "note")).toBe(false);
    await expect(host.renameSpace("Unsaved name")).rejects.toThrow("catalog unavailable");
    expect(published).toBe(0);
  });

  it("deletes an app and leaves a blank one if it was the last", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open();
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
    const shared = await host.inspectStore("space");
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
    const host = await Host.open();
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
    const pairs = rows.map((row) => [String(row.status), Number(row.amount)] as const);
    expect(pairs).toEqual(
      [...pairs].sort(
        ([leftStatus, leftAmount], [rightStatus, rightAmount]) =>
          leftStatus.localeCompare(rightStatus) || rightAmount - leftAmount,
      ),
    );
    expect(pairs).toContainEqual(["paid", 9000]);
    expect(pairs).toContainEqual(["sent", 500]);
  });

  it("chooses useful fields for new views and protects them on updates", async () => {
    expect.hasAssertions();
    const host = await Host.open();
    await host.upsertType({ key: "organisation", fields: { name: "text" } });
    await host.upsertType({
      key: "project",
      fields: {
        name: "text",
        client: { type: "reference", target: "organisation" },
        status: "text",
        owner: "text",
        budget: "number",
        due_date: "date",
        notes: "text",
      },
    });

    const created = await host.upsertView({ key: "delivery", source: "project" });
    expect(created.fields).toEqual([
      "name",
      "client.name",
      "status",
      "owner",
      "budget",
      "due_date",
    ]);

    const updated = await host.upsertView({ key: "delivery", label: "Delivery overview" });
    expect(updated.fields).toEqual(created.fields);
    await expect(host.upsertView({ key: "empty", source: "project", fields: [] })).rejects.toThrow(
      'View "empty" needs at least one field. Omit fields to choose useful defaults automatically.',
    );
  });

  it("accepts nested group blocks and a null folder on upsert_page", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open();
    await expect(host.upsertPage({ key: "blank", icon: "" as never })).rejects.toThrow(
      'Invalid page icon ""',
    );
    await expect(host.upsertPage({ key: "invalid", icon: "sparkles" as never })).rejects.toThrow(
      'Invalid page icon "sparkles"',
    );
  });

  it("accepts upsert_page when a group's inner blocks is a single object", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open();
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
    const host = await Host.open();
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
    const host = await Host.open();
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
    await host.upsertType({ key: "client", label: "Customer", collection_label: "Customers" });
    const kept = host.resolvedSpec().types.find((type) => type.key === "client");
    expect(kept?.label).toBe("Customer");
    expect(kept?.collection_label).toBe("Customers");
    expect(kept?.fields.map((field) => field.key)).toEqual(["name", "industry"]);
    await host.upsertType({ key: "client", collection_label: "" });
    const cleared = host.resolvedSpec().types.find((type) => type.key === "client");
    expect(cleared?.collection_label).toBeUndefined();
    expect(cleared?.fields.map((field) => field.key)).toEqual(["name", "industry"]);
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
    const host = await Host.open();
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
    const host = await Host.open();
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
    const host = await Host.open();
    const snap = host.snapshot();
    expect(snap.app).not.toBe(host.app());
    expect(snap.space).not.toBe(host.space());
    const original = host.app().name;
    snap.app.name = "Mutated in the UI copy";
    expect(host.app().name).toBe(original);
  });

  it("saves exposed view filters from a reactive array", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open();
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
    const expectedNumbers = (await host.listRecords("invoice"))
      .filter((row) => row.project === project!.id)
      .map((row) => row.number)
      .sort((left, right) => String(left).localeCompare(String(right)));
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows
        .map((row) => row.number)
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual(expectedNumbers);
    const empty = await host.queryView("project_invoices");
    expect(empty).toEqual([]);
  });

  it("applies related filters before limiting view results", async () => {
    const host = await Host.open();
    await host.loadSample("freelance_crm");
    await host.upsertView({
      key: "website_invoices",
      source: "invoice",
      fields: ["number", "project.name"],
      where: [{ field: "project.name", op: "eq", value: "Website redesign" }],
      order_by: { number: "asc" },
      limit: 1,
      implicit: false,
    });
    const rows = await host.queryView("website_invoices");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: "INV-101", "project.name": "Website redesign" });
  });

  it("previews a draft view without saving it", async () => {
    expect.hasAssertions();
    const host = await Host.open();
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
    const host = await Host.open({ gateway });
    await host.loadSample("freelance_crm");
    const oldSpace = host.space().id;
    const oldApp = host.app().id;
    await host.resetLocalData();
    const next = await Host.open({ gateway });
    expect(next.space().id).not.toBe(oldSpace);
    expect(next.app().id).not.toBe(oldApp);
    expect(next.space().id.startsWith("spc_")).toBe(false);
    expect(next.app().id.startsWith("spc_")).toBe(false);
    expect(next.snapshot().catalog.tables).toEqual(["actor", "kv", "space"]);
    expect(next.snapshot().stores.every((store) => !store.database.includes("spc_"))).toBe(true);
  });
});
