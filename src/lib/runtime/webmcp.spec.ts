import { describe, expect, it } from "vite-plus/test";
import { Host } from "./host.ts";
import { buildTools, createWebMcpBridge, toolSurface, type WebMcpToolRegistry } from "./webmcp.ts";

function mockRegistry() {
  const events: string[] = [];
  const tools = new Map<
    string,
    { execute: (input: Record<string, unknown>) => Promise<unknown> }
  >();
  const registry: WebMcpToolRegistry & { events: string[]; tools: typeof tools } = {
    events,
    tools,
    async registerTool(tool, options) {
      events.push(`register:${tool.name}`);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => events.push(`abort:${tool.name}`));
    },
  };
  return registry;
}

describe("webmcp bridge", () => {
  it("does not abort or re-register tools after a record mutation", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "note",
      fields: [{ key: "title", type: "text", label: "Title" }] as never,
    });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const afterBoot = [...registry.events];
    expect(afterBoot.some((event) => event === "register:create_note")).toBe(true);
    await host.create("note", { title: "Hello" });
    await host.create("note", { title: "Again" });
    await bridge.flush();
    expect(registry.events.slice(afterBoot.length)).toEqual([]);
    bridge.stop();
  });

  it("registers CRUD tools for a type added through upsert_type without aborting existing tools", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const upsert = registry.tools.get("upsert_type");
    expect(upsert).toBeTruthy();
    const abortsBefore = registry.events.filter((event) => event.startsWith("abort:")).length;
    const eventsBefore = registry.events.length;
    const result = await upsert!.execute({ key: "client", label: "Client" });
    expect(typeof result).toBe("string");
    expect(JSON.parse(String(result)).error).toBeUndefined();
    expect(registry.events.slice(eventsBefore)).toEqual([]);
    await bridge.flush();
    expect(registry.events.filter((event) => event.startsWith("abort:")).length).toBe(abortsBefore);
    expect(registry.events.some((event) => event === "register:create_client")).toBe(true);
    expect(registry.events.some((event) => event === "register:list_client")).toBe(true);
    expect(registry.tools.get("create_client")).toBeTruthy();
    bridge.stop();
  });

  it("does not call registerTool while a tool execute is still on the stack", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    let insideExecute = false;
    const orig = registry.registerTool.bind(registry);
    registry.registerTool = async (tool, options) => {
      expect(insideExecute).toBe(false);
      return orig(tool, options);
    };
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const upsert = registry.tools.get("upsert_type")!;
    const inner = upsert.execute;
    upsert.execute = async (input) => {
      insideExecute = true;
      try {
        return await inner(input);
      } finally {
        insideExecute = false;
      }
    };
    await upsert.execute({ key: "client", label: "Client" });
    await bridge.flush();
    expect(registry.tools.get("create_client")).toBeTruthy();
    bridge.stop();
  });

  it("retries registerTool with backoff instead of spinning when it throws", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const orig = registry.registerTool.bind(registry);
    let failRemaining = 0;
    let calls = 0;
    registry.registerTool = async (tool, options) => {
      calls += 1;
      if (failRemaining > 0) {
        failRemaining -= 1;
        throw new Error("transient");
      }
      return orig(tool, options);
    };
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    failRemaining = 2;
    const before = calls;
    await registry.tools.get("upsert_type")!.execute({ key: "client", label: "Client" });
    await bridge.flush();
    expect(calls - before).toBeGreaterThanOrEqual(3);
    expect(calls - before).toBeLessThan(20);
    expect(registry.tools.get("create_client")).toBeTruthy();
    bridge.stop();
  });

  it("picks up CRUD tools after create_app then upsert_type", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const createApp = registry.tools.get("create_app")!;
    await createApp.execute({ name: "Practice" });
    await bridge.flush();
    const upsert = registry.tools.get("upsert_type")!;
    await upsert.execute({ key: "client", label: "Client" });
    await bridge.flush();
    expect(registry.events.some((event) => event.startsWith("abort:upsert_type"))).toBe(false);
    expect(registry.tools.get("create_client")).toBeTruthy();
    expect(registry.tools.get("get_client")).toBeTruthy();
    expect(registry.tools.get("list_client")).toBeTruthy();
    bridge.stop();
  });

  it("returns JSON strings from tools", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const result = await registry.tools.get("get_space")!.execute({});
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(String(result));
    expect(parsed.app).toBeTruthy();
    expect(parsed.space).toBeTruthy();
    expect(Array.isArray(parsed.exposed_types)).toBe(true);
    bridge.stop();
  });

  it("lets an agent assign explicit enum badge semantics", async () => {
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "submission", fields: [] });
    const tools = new Map(buildTools(host).map((tool) => [tool.name, tool]));
    await tools.get("upsert_field")!.execute({
      type: "submission",
      key: "stage",
      field_type: "enum",
      values: ["submitted", "winner", "rejected"],
      presentation: "badge",
      value_semantics: {
        submitted: "neutral",
        winner: "success",
        rejected: "danger",
      },
    });
    expect(host.resolvedSpec().types[0]?.fields[0]).toMatchObject({
      presentation: "badge",
      value_semantics: { submitted: "neutral", winner: "success", rejected: "danger" },
    });
  });

  it("returns grouped view measures through the shared query_view tool", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "review",
      fields: [
        { key: "submission", type: "text" },
        { key: "score", type: "number" },
      ] as never,
    });
    await host.create("review", { submission: "A", score: 5 });
    await host.create("review", { submission: "A", score: 3 });
    await host.create("review", { submission: "B", score: 2 });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    await registry.tools.get("upsert_view")!.execute({
      key: "scores",
      source: "review",
      group_by: "submission",
      measures: {
        review_count: { op: "count" },
        average_score: { op: "avg", field: "score" },
        total_score: { op: "sum", field: "score" },
        lowest_score: { op: "min", field: "score" },
        highest_score: { op: "max", field: "score" },
      },
      order_by: { average_score: "desc" },
    });
    const result = JSON.parse(
      String(await registry.tools.get("query_view")!.execute({ view: "scores" })),
    );
    expect(result).toEqual([
      {
        id: "A",
        submission: "A",
        review_count: 2,
        average_score: 4,
        total_score: 8,
        lowest_score: 3,
        highest_score: 5,
      },
      {
        id: "B",
        submission: "B",
        review_count: 1,
        average_score: 2,
        total_score: 2,
        lowest_score: 2,
        highest_score: 2,
      },
    ]);
    bridge.stop();
  });

  it("lists space-exposed types on get_space and shares them across apps", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    await registry.tools.get("upsert_type")!.execute({
      key: "client",
      expose: true,
      fields: [{ key: "name", type: "text", required: true }],
    });
    await bridge.flush();
    const before = JSON.parse(String(await registry.tools.get("get_space")!.execute({})));
    expect(before.exposed_types.some((type: { key: string }) => type.key === "client")).toBe(true);
    await registry.tools.get("create_app")!.execute({ name: "Invoicing" });
    await bridge.flush();
    const after = JSON.parse(String(await registry.tools.get("get_space")!.execute({})));
    expect(after.exposed_types.some((type: { key: string }) => type.key === "client")).toBe(true);
    expect(registry.tools.get("create_client")).toBeTruthy();
    expect(host.space().spec.types.some((type) => type.key === "client" && type.expose)).toBe(true);
    expect(host.app().spec.types.some((type) => type.key === "client")).toBe(false);
    bridge.stop();
  });

  it("upsert_page accepts nested groups, including a single unwrapped child", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const upsert = registry.tools.get("upsert_page")!;
    const nested = await upsert.execute({
      key: "diag_nested",
      label: "Diagnostic Nested",
      path: "/diag-nested",
      blocks: [
        {
          kind: "group",
          columns: 1,
          blocks: [{ kind: "widget", widget: "heading", values: { title: "Diagnostics" } }],
        },
      ],
    });
    expect(JSON.parse(String(nested)).error).toBeUndefined();
    expect(JSON.parse(String(nested)).blocks[0].blocks[0].widget).toBe("heading");
    const unwrapped = await upsert.execute({
      key: "diag_unwrapped",
      label: "Diagnostic Unwrapped",
      path: "/diag-unwrapped",
      blocks: [
        {
          kind: "group",
          columns: 1,
          blocks: { kind: "widget", widget: "heading", values: { title: "Diagnostics" } },
        },
      ],
    });
    expect(JSON.parse(String(unwrapped)).error).toBeUndefined();
    expect(JSON.parse(String(unwrapped)).blocks[0].blocks).toEqual([
      { kind: "widget", widget: "heading", values: { title: "Diagnostics" } },
    ]);
    bridge.stop();
  });

  it("describes widget fields and validates agent-authored chart and board values", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({
      key: "task",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "status", label: "Status", type: "enum", values: ["todo", "done"] },
        { key: "points", label: "Points", type: "number" },
      ] as never,
    });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();

    const description = JSON.parse(
      String(
        await registry.tools.get("get_widgets")!.execute({ widget: "bar", view: "task_list" }),
      ),
    );
    expect(
      description.inputs.find((input: { key: string }) => input.key === "category").options,
    ).toEqual([
      { value: "title", label: "Title" },
      { value: "status", label: "Status" },
      { value: "points", label: "Points" },
    ]);
    expect(
      description.inputs.find((input: { key: string }) => input.key === "value").options,
    ).toEqual([{ value: "points", label: "Points" }]);

    const page = JSON.parse(
      String(
        await registry.tools.get("upsert_page")!.execute({
          key: "task_dashboard",
          blocks: [
            {
              kind: "group",
              columns: 2,
              blocks: [
                {
                  kind: "widget",
                  widget: "bar",
                  values: { view: "task_list", category: "status", value: "points" },
                },
                { kind: "widget", widget: "kanban", values: { view: "task_list" } },
              ],
            },
          ],
        }),
      ),
    );
    expect(page.error).toBeUndefined();
    expect(page.blocks[0].blocks[1].values).toEqual({ view: "task_list", field: "status" });

    const invalid = JSON.parse(
      String(
        await registry.tools.get("upsert_page")!.execute({
          key: "bad_board",
          blocks: [
            { kind: "widget", widget: "kanban", values: { view: "task_list", field: "points" } },
          ],
        }),
      ),
    );
    expect(invalid.error).toBe(
      'Widget "kanban" values.field cannot be "points". Valid options: status.',
    );
    bridge.stop();
  });

  it("upsert_type creates fields from an inline array or map", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const upsert = registry.tools.get("upsert_type")!;
    const fromArray = await upsert.execute({
      key: "client",
      fields: [
        { key: "name", type: "text", required: true },
        { key: "industry", type: "text" },
      ],
    });
    expect(JSON.parse(String(fromArray)).error).toBeUndefined();
    expect(JSON.parse(String(fromArray)).fields.map((field: { key: string }) => field.key)).toEqual(
      ["name", "industry"],
    );
    const fromMap = await upsert.execute({
      key: "company",
      fields: { name: { type: "text" }, website: "text" },
    });
    expect(JSON.parse(String(fromMap)).error).toBeUndefined();
    expect(JSON.parse(String(fromMap)).fields.map((field: { key: string }) => field.key)).toEqual([
      "name",
      "website",
    ]);
    bridge.stop();
  });

  it("returns a clear error when an agent supplies a blank field", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const result = await registry.tools.get("upsert_type")!.execute({
      key: "review",
      fields: [{ key: " ", label: " ", type: "number" }],
    });
    expect(JSON.parse(String(result))).toEqual({
      error: "Field needs a non-empty key or label",
    });
    expect(host.resolvedSpec().types.some((type) => type.key === "review")).toBe(false);
    bridge.stop();
  });

  it("puts enum values and reference targets on create/update schemas", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const createProject = buildTools(host).find((tool) => tool.name === "create_project");
    const properties = createProject?.inputSchema.properties as Record<
      string,
      { enum?: string[]; description?: string }
    >;
    expect(properties.status?.enum).toEqual(["planned", "active", "completed"]);
    expect(properties.client?.description).toMatch(/id of a organisation record/);
    const invoke = buildTools(host).find((tool) => tool.name === "invoke_mark_invoice_paid");
    expect(invoke).toBeTruthy();
    const invoice = (invoke!.inputSchema.properties as Record<string, { description?: string }>)
      .invoice;
    expect(invoice?.description).toMatch(/id of a invoice record/);
    expect(invoke!.description).toMatch(/invoke_mark_invoice_paid/);
    expect(toolSurface(createProject!)).toBe("app");
    expect(toolSurface(invoke!)).toBe("app");
    expect(toolSurface(buildTools(host).find((tool) => tool.name === "upsert_type")!)).toBe(
      "builder",
    );
  });

  it("does not apply_spec without confirm: true", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "note", fields: { title: "text" } });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const apply = registry.tools.get("apply_spec")!;
    const refused = JSON.parse(
      String(await apply.execute({ spec: "types:\n  gone:\n    fields:\n      x: text\n" })),
    );
    expect(refused.error).toMatch(/confirm: true/);
    expect(host.resolvedSpec().types.some((type) => type.key === "note")).toBe(true);
    const applied = JSON.parse(
      String(
        await apply.execute({
          spec: "types:\n  gone:\n    fields:\n      x: text\n",
          confirm: true,
        }),
      ),
    );
    expect(applied.error).toBeUndefined();
    expect(host.resolvedSpec().types.map((type) => type.key)).toContain("gone");
    expect(host.resolvedSpec().types.some((type) => type.key === "note")).toBe(false);
    bridge.stop();
  });

  it("refuses a confirmed apply_spec that has no types unless wipe is set", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.upsertType({ key: "note", fields: { title: "text" } });
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const apply = registry.tools.get("apply_spec")!;
    const refused = JSON.parse(
      String(await apply.execute({ spec: '{"key":"foo"}', confirm: true })),
    );
    expect(refused.error).toMatch(/wipe: true/);
    expect(host.resolvedSpec().types.some((type) => type.key === "note")).toBe(true);
    const wiped = JSON.parse(
      String(await apply.execute({ spec: { key: "foo" }, confirm: true, wipe: true })),
    );
    expect(wiped.error).toBeUndefined();
    expect(host.app().spec.types).toEqual([]);
    bridge.stop();
  });

  it("query_view runs a named view and names unknown views", async () => {
    expect.hasAssertions();
    const host = await Host.open({ persist: false });
    await host.loadSample("freelance_crm");
    const registry = mockRegistry();
    const bridge = createWebMcpBridge(host, registry);
    await bridge.flush();
    const query = registry.tools.get("query_view")!;
    const rows = JSON.parse(String(await query.execute({ view: "active_projects" })));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((row: { status?: string }) => row.status === "active")).toBe(true);
    const missing = JSON.parse(String(await query.execute({ view: "nope" })));
    expect(missing.error).toMatch(/Unknown view/);
    expect(missing.views).toContain("active_projects");
    const paid = JSON.parse(
      String(await query.execute({ view: "unpaid_invoices", expose: { status: "paid" } })),
    );
    expect(Array.isArray(paid)).toBe(true);
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((row: { status?: string }) => row.status === "paid")).toBe(true);
    const asString = JSON.parse(
      String(await query.execute({ view: "unpaid_invoices", expose: '{"status":"paid"}' })),
    );
    expect(asString.every((row: { status?: string }) => row.status === "paid")).toBe(true);
    await host.upsertView({
      key: "all_invoices",
      source: "invoice",
      fields: ["number", "status"],
    });
    await bridge.flush();
    const noExpose = JSON.parse(
      String(await query.execute({ view: "all_invoices", expose: { status: "paid" } })),
    );
    expect(noExpose.error).toMatch(/no expose filters/);
    bridge.stop();
  });
});
