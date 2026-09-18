import type { InferenceMessage } from "@jthum/framework/kernel";
import { nanoid } from "nanoid";
import { session } from "./session.svelte.ts";
import {
  assistantConfigured,
  loadAssistantSettings,
  type AssistantSettings,
} from "$lib/inference/settings.ts";

export interface AssistantMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  content: string;
}

class AssistantState {
  open = $state(false);
  running = $state(false);
  configured = $state(false);
  checking = $state(true);
  status = $state("");
  error = $state<string | null>(null);
  messages = $state<AssistantMessage[]>([]);

  private appId = "";
  private history: readonly InferenceMessage[] = [];
  private controller: AbortController | null = null;

  async refreshConfiguration(): Promise<AssistantSettings> {
    this.checking = true;
    try {
      const settings = await loadAssistantSettings();
      this.configured = assistantConfigured(settings);
      return settings;
    } finally {
      this.checking = false;
    }
  }

  selectApp(appId: string): void {
    if (!appId || appId === this.appId) return;
    this.cancel();
    this.appId = appId;
    this.history = [];
    this.messages = [];
    this.error = null;
    this.status = "";
  }

  async send(content: string): Promise<void> {
    const prompt = content.trim();
    if (!prompt || this.running) return;
    const framework = session.framework;
    if (!framework) return;
    const settings = await this.refreshConfiguration();
    if (!assistantConfigured(settings)) {
      this.open = true;
      return;
    }

    const user: AssistantMessage = { id: nanoid(), role: "user", content: prompt };
    const response: AssistantMessage = { id: nanoid(), role: "assistant", content: "" };
    this.messages = [...this.messages, user, response];
    const messages: readonly InferenceMessage[] = [
      ...this.history,
      { role: "user", content: prompt },
    ];
    this.running = true;
    this.error = null;
    this.status = "Thinking";
    this.controller = new AbortController();

    try {
      const events = await framework.appClient.runInference({
        messages,
        instructions: AUTHORING_INSTRUCTIONS,
        model: {
          provider: "openai-compatible",
          model: settings.model,
          credentialRef: "browser-assistant",
        },
        signal: this.controller.signal,
      });
      for await (const event of events) {
        if (event.type === "text_delta") {
          response.content += event.delta;
          this.messages = [...this.messages];
          this.status = "Writing";
        } else if (event.type === "tool_call") {
          this.status = `Using ${readableTool(event.toolId)}`;
        } else if (event.type === "tool_result") {
          this.status = `Finished ${readableTool(event.toolId)}`;
        } else if (event.type === "tool_error") {
          this.status = `${readableTool(event.toolId)} could not finish`;
        } else if (event.type === "completed") {
          this.history = event.messages ?? [
            ...messages,
            { role: "assistant", content: response.content || outputText(event.output) },
          ];
          if (!response.content) response.content = outputText(event.output);
          response.content = response.content.trim();
        } else if (event.type === "failed") {
          throw new Error(event.error.message);
        } else if (event.type === "refused") {
          throw new Error(event.reason ?? "The model declined this request.");
        } else if (event.type === "cancelled") {
          if (!response.content) response.content = "Stopped.";
        }
      }
      if (!response.content) response.content = "Done.";
      this.messages = [...this.messages];
    } catch (error) {
      if (this.controller?.signal.aborted) {
        if (!response.content) response.content = "Stopped.";
      } else {
        this.error = error instanceof Error ? error.message : "The assistant could not finish.";
        if (!response.content) response.content = "I couldn’t complete that request.";
      }
      this.messages = [...this.messages];
    } finally {
      this.running = false;
      this.status = "";
      this.controller = null;
    }
  }

  cancel(): void {
    this.controller?.abort();
  }

  clear(): void {
    if (this.running) return;
    this.history = [];
    this.messages = [];
    this.error = null;
    this.status = "";
  }
}

const AUTHORING_INSTRUCTIONS = `You help the user build and refine the currently selected Builder.run app.
Inspect the current app before changing it. Prefer focused authoring tools that preserve unrelated definitions. Use apply_spec only when the user explicitly asks to replace the complete app definition. Ask a concise clarifying question when a material product choice is missing. Keep stable definition IDs when updating existing items. Never claim a mutation succeeded unless its tool returned a successful result; correct invalid input or explain the failure. After making changes, briefly explain what changed.`;

function readableTool(id: string): string {
  return id
    .replace(/^builder:/, "")
    .split("_")
    .filter(Boolean)
    .join(" ");
}

function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output, null, 2);
}

export const assistant = new AssistantState();
