import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { render } from "svelte/server";
import type { BlockProps } from "./types.ts";
import { loadBlock, loadBlockPreview } from "./registry.ts";
import { previewSpec } from "./preview-fixtures.ts";
import {
  blockByKey,
  blockInputOptions,
  configureBlockConfig,
  defaultBlockConfig,
} from "$lib/runtime/blocks.ts";

vi.mock("$lib/app/session.svelte.ts", () => ({ session: { accent: "blue" } }));

const keys = ["navigation_card", "status_breakdown", "agenda", "gallery"] as const;
beforeAll(async () => {
  await Promise.all(keys.map((key) => loadBlock(key)));
}, 30_000);

function fixture(nested = true): BlockProps {
  return {
    config: {
      view: "work",
      title: "Work",
      title_field: "name",
      description_field: "project.name",
      date_field: "deadline",
      image_field: "cover",
      status_field: "phase",
    },
    spec: {
      id: "app",
      key: "app",
      label: "App",
      forms: [],
      pages: [],
      workflows: [],
      types: [
        {
          id: "task",
          key: "task",
          label: "Task",
          fields: [
            { id: "name", key: "name", label: "Name", type: "text" },
            { id: "date", key: "deadline", label: "Deadline", type: "datetime" },
            { id: "image", key: "cover", label: "Cover", type: "text" },
            { id: "phase", key: "phase", label: "Phase", type: "enum", values: ["Open", "Done"] },
            { id: "amount", key: "amount", label: "Amount", type: "number" },
            {
              id: "project",
              key: "project",
              label: "Project",
              type: "reference",
              target: "project",
            },
          ],
        },
        {
          id: "project",
          key: "project",
          label: "Project",
          fields: [{ id: "project_name", key: "name", label: "Name", type: "text" }],
        },
      ],
      views: [
        {
          id: "work",
          key: "work",
          label: "Work",
          source: "task",
          fields: ["name", "deadline", "cover", "phase", "amount", "project", "project.name"],
          aliases: nested
            ? {
                name: ["details", "title"],
                deadline: ["details", "date"],
                cover: ["details", "image"],
                phase: ["details", "phase"],
                project: ["client", "id"],
                "project.name": ["client", "label"],
              }
            : {
                name: "title",
                deadline: "due",
                cover: "image",
                phase: "state",
                project: "client_id",
                "project.name": "client_name",
              },
        },
      ],
    },
    rows: {
      work: [
        nested
          ? {
              id: "task/1",
              details: {
                title: "Prepare launch",
                date: "2026-01-15",
                image: "https://example.com/launch.jpg",
                phase: "Open",
              },
              client: { id: "project/1", label: "Spring launch" },
            }
          : {
              id: "task/1",
              title: "Prepare launch",
              due: "2026-01-15",
              image: "https://example.com/launch.jpg",
              state: "Open",
              client_id: "project/1",
              client_name: "Spring launch",
            },
      ],
    },
  };
}

async function body(key: (typeof keys)[number], props: BlockProps) {
  return render((await loadBlock(key))!, { props }).body;
}

describe("new page blocks", () => {
  it.each(keys)("loads and renders the Library preview for %s", async (key) => {
    const preview = (await loadBlockPreview(key))!;
    const props = {
      ...preview,
      spec: preview.spec ?? previewSpec,
      rows: preview.rows ?? {},
      ready: true,
    };
    expect(() => configureBlockConfig(props.spec, blockByKey(key)!, props.config)).not.toThrow();
    const html = await body(key, props);
    expect(html).toContain(String(preview.config.title));
    expect(html).not.toMatch(/NaN|Infinity|Pick a view|data-slot="empty-title"/);
  });

  it.each([false, true])(
    "renders projected record and relationship labels with nested=%s",
    async (nested) => {
      const props = fixture(nested);
      for (const key of ["agenda", "gallery"] as const) {
        const html = await body(key, props);
        expect(html).toContain("Prepare launch");
        expect(html).toContain("Spring launch");
        expect(html).toContain('href="/t/task/task%2F1"');
        expect(html).toContain('href="/t/project/project%2F1"');
      }
      const breakdown = await body("status_breakdown", props);
      expect(breakdown).toContain("Open");
      expect(breakdown).toContain("100%");
    },
  );

  it.each(["agenda", "gallery", "status_breakdown"] as const)(
    "has loading, empty and unconfigured states for %s",
    async (key) => {
      const props = fixture();
      expect(await body(key, { ...props, ready: false })).toContain('data-slot="skeleton"');
      expect(await body(key, { ...props, rows: {} })).toContain('data-slot="empty-title"');
      expect(await body(key, { ...props, spec: undefined })).toContain("Pick a view");
    },
  );

  it("defaults to counts and leaves optional supporting fields blank", () => {
    const spec = fixture().spec!;
    expect(defaultBlockConfig(blockByKey("status_breakdown")!, spec).value_field).toBe("");
    for (const key of ["agenda", "gallery"]) {
      expect(defaultBlockConfig(blockByKey(key)!, spec).description_field).toBe("");
    }
    const input = blockByKey("agenda")!.inputs.find((input) => input.key === "date_field")!;
    expect(blockInputOptions(spec, input, { view: "work" })).toContainEqual({
      value: "deadline",
      label: "Deadline",
    });
  });

  it("shows the local event time for datetime values and preserves the instant in markup", async () => {
    const props = fixture();
    const date = new Date(2026, 0, 15, 14, 30);
    props.rows.work = [{ id: "event", details: { title: "Review", date: date.toISOString() } }];
    const html = await body("agenda", props);
    expect(html).toContain(`datetime="${date.toISOString()}"`);
    expect(html).toContain(
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
  });

  it("does not create record links for grouped results or missing identities", async () => {
    const props = fixture();
    for (const row of props.rows.work!) delete row.id;
    for (const key of ["agenda", "gallery"] as const) {
      expect(await body(key, props)).not.toContain('href="/t/task/');
    }
    props.spec!.views[0]!.group_by = "phase";
    props.rows.work![0]!.id = "computed";
    for (const key of ["agenda", "gallery"] as const) {
      expect(await body(key, props)).not.toContain('href="/t/task/');
    }
  });

  it("renders a whole-card navigation link and omits unsafe destinations", async () => {
    const props = {
      rows: {},
      config: { title: "Projects", description: "Find your next project", href: "/v/projects" },
    };
    const html = await body("navigation_card", props);
    expect(html).toContain('href="/v/projects"');
    expect(html.match(/<a\s/g)).toHaveLength(1);
    expect(html).toContain("Find your next project");
    expect(html).toContain("after:inset-0");
    props.config.href = "javascript:alert(1)";
    const invalid = await body("navigation_card", props);
    expect(invalid).not.toContain("javascript:");
    expect(invalid).not.toContain("<a ");
    expect(invalid).toContain("Add a destination link");
  });

  it("loads gallery images lazily, preserves captions and provides invalid-image placeholders", async () => {
    const props = fixture();
    const html = await body("gallery", props);
    expect(html).toContain('src="https://example.com/launch.jpg"');
    expect(html).toContain('alt="Prepare launch"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    props.rows.work!.push({ details: { title: "Missing image", image: "javascript:alert(1)" } });
    const invalid = await body("gallery", props);
    expect(invalid).toContain("Image unavailable");
    expect(invalid).toContain("Missing image");
    expect(invalid).not.toContain("javascript:");
    props.config.limit = 1;
    expect(await body("gallery", props)).not.toContain("Missing image");
  });

  it("renders grouped status measures rather than the number of groups", async () => {
    const props = fixture();
    Object.assign(props.spec!.views[0]!, {
      group_by: "phase",
      group_alias: "state",
      measures: { count: { op: "count" } },
    });
    props.rows.work = [
      { state: "Open", count: 3 },
      { state: "Done", count: 1 },
    ];
    props.config.value_field = "count";
    const html = await body("status_breakdown", props);
    expect(html).toContain("75%");
    expect(html).toContain("25%");
    expect(html).not.toMatch(/NaN|Infinity/);
    props.rows.work = [{ state: "Open", count: 0 }];
    expect(await body("status_breakdown", props)).toContain("No values to show");
  });
});
