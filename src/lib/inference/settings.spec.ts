import { describe, expect, it } from "vite-plus/test";
import {
  assistantConfigured,
  DEFAULT_ASSISTANT_SETTINGS,
  loadAssistantSettings,
  saveAssistantSettings,
} from "./settings.ts";

describe("browser assistant settings", () => {
  it("stays optional outside a browser", async () => {
    await expect(loadAssistantSettings()).resolves.toEqual(DEFAULT_ASSISTANT_SETTINGS);
    await expect(
      saveAssistantSettings({ baseUrl: "https://example.test/v1", model: "model", apiKey: "key" }),
    ).resolves.toBeUndefined();
    expect(assistantConfigured(DEFAULT_ASSISTANT_SETTINGS)).toBe(false);
    expect(
      assistantConfigured({
        baseUrl: "https://example.test/v1",
        model: "model",
        apiKey: "key",
      }),
    ).toBe(true);
  });
});
