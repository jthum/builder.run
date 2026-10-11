import { describe, expect, it } from "vite-plus/test";
import { Kernel } from "@jthum/framework/kernel";
import { createWorkspaceClient } from "@jthum/framework/client";
import { browserSecretCipher } from "./secrets.ts";
import { createKernelSqlitePersistence } from "./sqlite.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("browser SecretCipher", () => {
  it("reuses the local key and binds ciphertext to its Workspace and setting", async () => {
    const target = storage();
    const cipher = browserSecretCipher(target);
    expect(target.length).toBe(0);
    const encrypted = await cipher.encrypt("private", "app", "api_key");
    expect(encrypted).toMatchObject({ version: 1, algorithm: "AES-GCM" });
    expect(JSON.stringify(encrypted)).not.toContain("private");
    expect(await cipher.decrypt(encrypted, "app", "api_key")).toBe("private");
    expect(target.length).toBe(1);
    const reopened = browserSecretCipher(target);
    expect(await reopened.decrypt(encrypted, "app", "api_key")).toBe("private");
    await expect(reopened.decrypt(encrypted, "another_app", "api_key")).rejects.toThrow();
    await expect(reopened.decrypt(encrypted, "app", "another_key")).rejects.toThrow();
  });

  it("does not replace an invalid stored key", async () => {
    const target = storage();
    target.setItem("builder-run-secret-key", btoa("invalid"));
    await expect(browserSecretCipher(target).encrypt("private", "app", "api_key")).rejects.toThrow(
      "encryption key is invalid",
    );
    expect(target.getItem("builder-run-secret-key")).toBe(btoa("invalid"));
  });

  it("seals, masks, reopens and deletes Framework Workspace secrets", async () => {
    const target = storage();
    const gateway = createNodeGateway();
    const persistence = createKernelSqlitePersistence(gateway);
    let kernel = await Kernel.open({
      persistence,
      secretCipher: browserSecretCipher(target),
    });
    try {
      const root = await kernel.createRootWorkspace({ name: "Space", user: { name: "Jane" } });
      const context = { workspaceId: root.workspace.id, actorId: root.user.id };
      let client = await createWorkspaceClient(kernel, context);
      await client.putSetting({
        key: "api_key",
        label: "API key",
        secret: true,
        value: "test-private-key",
      });
      expect(await client.getSetting("api_key")).toMatchObject({
        secret: true,
        configured: true,
        maskedValue: "••••-key",
      });
      expect(await client.getSetting("api_key")).not.toHaveProperty("value");
      const connection = await gateway.open("catalog.db");
      const rows = await connection.query(
        "SELECT config_json FROM workspace_configs WHERE workspace_id = ?",
        [root.workspace.id],
      );
      expect(JSON.stringify(rows)).not.toContain("test-private-key");
      expect(JSON.parse(String(rows[0]?.config_json))).toMatchObject({
        settings: [{ key: "api_key", encrypted: { algorithm: "AES-GCM" } }],
      });
      await connection.close();
      await kernel.close();
      kernel = await Kernel.open({ persistence, secretCipher: browserSecretCipher(target) });
      client = await createWorkspaceClient(kernel, context);
      expect((await client.getSetting("api_key"))?.configured).toBe(true);
      // Omitting a replacement value must retain the sealed credential.
      await client.putSetting({ key: "api_key", label: "Renamed API key", secret: true });
      expect((await client.getSetting("api_key"))?.configured).toBe(true);
      await client.deleteSetting("api_key");
      expect(await client.getSetting("api_key")).toBeNull();
    } finally {
      await kernel.close();
      await gateway.wipe();
    }
  });
});
