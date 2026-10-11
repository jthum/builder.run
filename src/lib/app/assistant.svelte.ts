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
  reasoning?: string;
  tools?: readonly AssistantToolCall[];
}

export interface AssistantToolCall {
  readonly id: string;
  readonly label: string;
  readonly status: "running" | "completed" | "failed" | "stopped";
  readonly error?: string;
}

export class AssistantState {
  open = $state(false);
  running = $state(false);
  configured = $state(false);
  checking = $state(true);
  status = $state("");
  model = $state("");
  error = $state<string | null>(null);
  messages = $state<AssistantMessage[]>([]);

  private appId = "";
  private spaceId = "";
  private actorId = "";
  private readonly selectionCalls = new Set<string>();
  private history: readonly InferenceMessage[] = [];
  private controller: AbortController | null = null;

  async refreshConfiguration(): Promise<AssistantSettings> {
    this.checking = true;
    try {
      const settings = await loadAssistantSettings();
      this.configured = assistantConfigured(settings);
      this.model = settings.model;
      return settings;
    } finally {
      this.checking = false;
    }
  }

  selectApp(appId: string, spaceId: string, actorId: string): void {
    if (!appId || (appId === this.appId && actorId === this.actorId && spaceId === this.spaceId))
      return;
    const followTool =
      this.running &&
      this.selectionCalls.size > 0 &&
      spaceId === this.spaceId &&
      actorId === this.actorId;
    this.appId = appId;
    this.spaceId = spaceId;
    this.actorId = actorId;
    if (followTool) return;
    this.cancel();
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
    // Lock the turn before loading settings; a double click must not start two runs.
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    let settings: AssistantSettings;
    try {
      settings = await this.refreshConfiguration();
    } catch (error) {
      if (!controller.signal.aborted)
        this.error = error instanceof Error ? error.message : "Could not load assistant settings.";
      this.running = false;
      this.controller = null;
      return;
    }
    if (!assistantConfigured(settings)) {
      this.open = true;
      this.running = false;
      this.controller = null;
      return;
    }
    if (controller.signal.aborted) {
      this.running = false;
      this.controller = null;
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
    let completed = false;
    this.running = true;
    this.error = null;
    this.status = "Thinking";

    try {
      const events = await framework.spaceClient.runInference({
        messages,
        instructions: ASSISTANT_INSTRUCTIONS,
        model: {
          provider: "openai-compatible",
          model: settings.model,
        },
        metadata: { surface: "assistant" },
        signal: controller.signal,
      });
      for await (const event of events) {
        if (controller.signal.aborted) break;
        if (event.type === "text_delta") {
          responseContent += event.delta;
          this.updateMessage(response.id, responseContent);
          this.status = "Writing";
        } else if (event.type === "tool_call") {
          if (SELECTION_TOOLS.has(event.toolId)) this.selectionCalls.add(event.id);
          this.updateActivity(response.id, {
            id: event.id,
            label: readableTool(event.toolId),
            status: "running",
          });
          this.status = `Using ${readableTool(event.toolId)}`;
        } else if (event.type === "tool_result") {
          this.selectionCalls.delete(event.callId);
          this.updateActivity(response.id, {
            id: event.callId,
            label: readableTool(event.toolId),
            status: "completed",
          });
          this.status = `Finished ${readableTool(event.toolId)}`;
        } else if (event.type === "tool_error") {
          this.selectionCalls.delete(event.callId);
          this.updateActivity(response.id, {
            id: event.callId,
            label: readableTool(event.toolId),
            status: "failed",
            error: event.error.message,
          });
          this.status = `${readableTool(event.toolId)} could not finish`;
        } else if (event.type === "reasoning_delta") {
          this.messages = this.messages.map((message) =>
            message.id === response.id
              ? { ...message, reasoning: (message.reasoning ?? "") + event.delta }
              : message,
          );
        } else if (event.type === "completed") {
          completed = true;
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
      if (!responseContent) responseContent = controller.signal.aborted ? "Stopped." : "Done.";
      this.updateMessage(response.id, responseContent);
    } catch (error) {
      if (controller.signal.aborted) {
        if (!responseContent) responseContent = "Stopped.";
      } else {
        this.error = error instanceof Error ? error.message : "The assistant could not finish.";
        if (!responseContent) responseContent = "I couldn’t complete that request.";
      }
      this.updateMessage(response.id, responseContent);
    } finally {
      // A failed/limited turn may already have changed the App. Keep an honest textual
      // handoff for follow-ups instead of silently forgetting those successful mutations.
      // Provider replay state is used only for normally completed turns.
      const retainedResponse = this.messages.find((message) => message.id === response.id);
      if (!completed && retainedResponse) {
        const activity = retainedResponse.tools?.map((call) =>
          call.status === "running" ? { ...call, status: "stopped" } : call,
        );
        this.history = [
          ...messages,
          {
            role: "assistant",
            content:
              responseContent +
              (activity?.length
                ? `\nTool activity: ${activity.map((call) => `${call.label}: ${call.status}${call.error ? ` (${call.error})` : ""}`).join("; ")}`
                : ""),
          },
        ];
      }
      this.running = false;
      this.status = "";
      this.controller = null;
      this.selectionCalls.clear();
      this.messages = this.messages.map((message) => ({
        ...message,
        tools: message.tools?.map((tool) =>
          tool.status === "running" ? { ...tool, status: "stopped" } : tool,
        ),
      }));
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

  private updateActivity(messageId: string, call: AssistantToolCall): void {
    this.messages = this.messages.map((message) => {
      if (message.id !== messageId) return message;
      const tools = message.tools ?? [];
      return {
        ...message,
        tools: tools.some((tool) => tool.id === call.id)
          ? tools.map((tool) => (tool.id === call.id ? call : tool))
          : [...tools, call],
      };
    });
  }
}

const SELECTION_TOOLS = new Set(["builder:create_app", "builder:switch_app", "builder:delete_app"]);
const ASSISTANT_INSTRUCTIONS = `You help the user build, refine and use the currently selected Builder.run app.
You can inspect and modify its Collections, Views, Forms, Pages, Rules and records using the same tools as WebMCP. Use search_tools to discover relevant tools as needed. App creation and switching select a new app immediately; inspect its Spec before making further changes. Creating an independent Space changes the User context and ends this turn; the user can continue there in a new turn. Never delete an App or record unless the user explicitly asks for that deletion. Do not send credentials in tool arguments or conversation content.
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
