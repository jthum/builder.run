import { describe, expect, it } from "vite-plus/test";
import { viewOutputKey } from "./view-results.ts";

describe("View result projection", () => {
  it("maps readable relationship paths to canonical selection aliases", () => {
    const view = {
      id: "portfolio",
      key: "portfolio",
      label: "Portfolio",
      source: "project",
      fields: ["name", "client.name"],
    };
    expect(viewOutputKey(view, "name")).toBe("name");
    expect(viewOutputKey(view, "client.name")).toBe("client_name");
  });

  it("retains explicitly authored and aggregate aliases", () => {
    expect(
      viewOutputKey(
        {
          id: "portfolio",
          key: "portfolio",
          label: "Portfolio",
          source: "project",
          fields: ["client.name"],
          aliases: { "client.name": "customer" },
        },
        "client.name",
      ),
    ).toBe("customer");
    expect(
      viewOutputKey(
        {
          id: "summary",
          key: "summary",
          label: "Summary",
          source: "project",
          fields: ["client", "count"],
          group_by: "client",
          group_alias: "customer",
          measures: { count: { op: "count" } },
        },
        "client",
      ),
    ).toBe("customer");
  });
});
