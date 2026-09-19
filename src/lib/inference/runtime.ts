import type { InferenceContext, InferenceEvent, InferenceRuntime } from "@jthum/framework/kernel";
import { loadAssistantSettings } from "./settings.ts";

export function createBrowserInferenceRuntime(): InferenceRuntime {
  return new BrowserInferenceRuntime();
}

class BrowserInferenceRuntime implements InferenceRuntime {
  async *run(context: InferenceContext): AsyncIterable<InferenceEvent> {
    const [{ yair }, { openAI }] = await Promise.all([
      import("@jthum/yair"),
      import("@jthum/yair-openai"),
    ]);
    const settings = await loadAssistantSettings();
    const runtime = yair({
      maxSteps: 32,
      provider: openAI({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        defaultModel: settings.model,
        stream: true,
      }),
    });
    yield* runtime.run(context);
  }
}
