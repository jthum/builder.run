import { describe, expect, it } from "vite-plus/test";
import {
  assistantConfigured,
  DEFAULT_ASSISTANT_SETTINGS,
  loadAssistantSettings,
  saveAssistantSettings,
} from "./settings.ts";

describe("browser assistant settings", () => {
  it("keeps reads optional but does not report an unavailable settings write as successful", async () => {
    await expect(loadAssistantSettings()).resolves.toEqual(DEFAULT_ASSISTANT_SETTINGS);
    await expect(
      saveAssistantSettings({ baseUrl: "https://example.test/v1", model: "model", apiKey: "key" }),
    ).rejects.toMatchObject({ code: "ENVIRONMENT.CAPABILITY_UNAVAILABLE" });
    expect(assistantConfigured(DEFAULT_ASSISTANT_SETTINGS)).toBe(false);
    expect(
      assistantConfigured({
        baseUrl: "https://example.test/v1",
        model: "model",
        apiKey: "key",
      }),
    ).toBe(true);
    expect(
      assistantConfigured({ baseUrl: "http://localhost:8000/v1", model: "local", apiKey: "" }),
    ).toBe(true);
    expect(
      assistantConfigured({ baseUrl: "https://example.test/v1", model: " ", apiKey: "key" }),
    ).toBe(false);
  });
});
