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
    let responseContent = "";
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
          responseContent += event.delta;
          this.updateMessage(response.id, responseContent);
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
            { role: "assistant", content: responseContent || outputText(event.output) },
          ];
          if (!responseContent) responseContent = outputText(event.output);
          responseContent = responseContent.trim();
          this.updateMessage(response.id, responseContent);
        } else if (event.type === "failed") {
          throw new Error(event.error.message);
        } else if (event.type === "refused") {
          throw new Error(event.reason ?? "The model declined this request.");
        } else if (event.type === "cancelled") {
          if (!responseContent) responseContent = "Stopped.";
          this.updateMessage(response.id, responseContent);
        }
      }
      if (!responseContent) responseContent = "Done.";
      this.updateMessage(response.id, responseContent);
    } catch (error) {
      if (this.controller?.signal.aborted) {
        if (!responseContent) responseContent = "Stopped.";
      } else {
        this.error = error instanceof Error ? error.message : "The assistant could not finish.";
        if (!responseContent) responseContent = "I couldn’t complete that request.";
      }
      this.updateMessage(response.id, responseContent);
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

  private updateMessage(id: string, content: string): void {
    this.messages = this.messages.map((message) =>
      message.id === id ? { ...message, content } : message,
    );
  }
}

const AUTHORING_INSTRUCTIONS = `You help the user build and refine the currently selected Builder.run app.
Inspect the current app before changing it. Prefer focused authoring tools that preserve unrelated definitions. Collections belong to the current app by default; set shared to true only when the user explicitly asks to share a Collection across apps in the Space. Use apply_spec only when the user explicitly asks to replace the complete app definition. Ask a concise clarifying question when a material product choice is missing. Keep stable definition IDs when updating existing items. Never claim a mutation succeeded unless its tool returned a successful result; correct invalid input or explain the failure. After making changes, briefly explain what changed.`;

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
