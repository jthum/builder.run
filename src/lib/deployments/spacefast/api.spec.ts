import { describe, it, expect } from "vite-plus/test";
import { SpacefastApi } from "./api.ts";

const response = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });
describe("direct Spacefast publishing", () => {
  it("keeps the same intent across a lost response and sends the account key only to the API", async () => {
    const intents: { body: unknown; key: string | null }[] = [];
    let fail = true,
      uploaded = false;
    const send: typeof fetch = async (url, init) => {
      const path = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url)
        .pathname;
      const headers = new Headers(init?.headers);
      if (path === "/v1/publish") {
        intents.push({
          body: JSON.parse(init!.body as string),
          key: headers.get("Idempotency-Key"),
        });
        if (fail) {
          fail = false;
          throw new TypeError("Lost response");
        }
        return response({
          space: { id: "space", teamId: "team" },
          version: { id: "version" },
          next: { action: "upload", url: "/refresh" },
          upload: { targets: [] },
          links: { refresh: "/refresh", finalize: "/finalize" },
        });
      }
      if (path === "/refresh")
        return response({
          upload: uploaded
            ? null
            : {
                targets: [
                  {
                    path: "index.html",
                    url: "https://uploads.example.test/bytes",
                    method: "PUT",
                    headers: { "x-upload-token": "scoped" },
                  },
                ],
              },
        });
      if (
        new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).origin ===
        "https://uploads.example.test"
      ) {
        expect(headers.has("authorization")).toBe(false);
        expect(headers.get("x-upload-token")).toBe("scoped");
        uploaded = true;
        return new Response(null, { status: 200 });
      }
      expect(headers.get("authorization")).toBe("Bearer account-key");
      if (path === "/finalize") return response({ id: "version", status: "ready" });
      if (path.endsWith("/versions/version")) return response({ status: "ready" });
      return response({
        id: "space",
        teamId: "team",
        channels: { live: { versionId: "version" } },
      });
    };
    const api = new SpacefastApi("account-key", send);
    const job = api.startPublish(
      {
        spaceId: "space",
        teamId: "team",
        files: [
          { path: "index.html", contentType: "text/html", bytes: new TextEncoder().encode("App") },
        ],
        sourceMetadata: {},
      },
      () => {},
    );
    await expect(job.run()).rejects.toMatchObject({ code: "DEPLOYMENT.CONNECTION_FAILED" });
    expect(await job.run()).toMatchObject({ spaceId: "space", versionId: "version" });
    expect(intents[0]).toEqual(intents[1]);
    expect(JSON.stringify(intents)).not.toContain("account-key");
  });
  it("checks activation instead of treating a ready version as live", async () => {
    const api = new SpacefastApi("key", async (url) => {
      const path = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url)
        .pathname;
      if (path === "/v1/publish")
        return response({
          space: { id: "space", teamId: "team" },
          version: { id: "version" },
          next: { action: "done" },
          links: {},
        });
      if (path.endsWith("/versions/version")) return response({ status: "ready" });
      return response({ id: "space", teamId: "team", channels: { live: { versionId: "other" } } });
    });
    await expect(
      api
        .startPublish({ spaceId: "space", teamId: "team", files: [], sourceMetadata: {} }, () => {})
        .run(),
    ).rejects.toMatchObject({ code: "DEPLOYMENT.NOT_ACTIVATED" });
  });
  it("does not forward the key to an unexpected status origin", async () => {
    let calls = 0;
    const api = new SpacefastApi("key", async () => {
      calls++;
      return response({});
    });
    await expect(api.request("https://unrelated.example.test/status")).rejects.toMatchObject({
      code: "DEPLOYMENT.INVALID_URL",
    });
    expect(calls).toBe(0);
  });
  it("reuses a Space creation intent after an uncertain response", async () => {
    const keys: string[] = [];
    const api = new SpacefastApi("key", async (_url, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      if (keys.length === 1) throw new TypeError("Connection lost");
      return response({ space: { id: "space", teamId: "team" } });
    });
    await expect(api.createSpace("team", "App")).rejects.toMatchObject({
      code: "DEPLOYMENT.CONNECTION_FAILED",
    });
    expect((await api.createSpace("team", "App")).id).toBe("space");
    expect(keys[0]).toBe(keys[1]);
  });
  it("waits for configuration synchronization from the envelope's operation", async () => {
    const calls: string[] = [];
    const api = new SpacefastApi("key", async (url) => {
      const path = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url)
        .pathname;
      calls.push(path);
      return path.endsWith("OWNER_EMAIL")
        ? new Response(JSON.stringify({ data: { name: "OWNER_EMAIL" }, operation: { id: "sync" } }))
        : response({ status: "succeeded" });
    });
    await api.setOwner("space", "owner@example.test");
    expect(calls).toEqual(["/v1/spaces/space/variables/OWNER_EMAIL", "/v1/operations/sync"]);
  });
});
