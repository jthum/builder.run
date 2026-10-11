import type {
  InferenceContext,
  InferenceEvent,
  InferenceRuntime,
  InferenceToolProvider,
} from "@jthum/framework/kernel";
import { assistantGateway } from "./assistant-gateway.ts";
import { asFrameworkError, invalidInput } from "@jthum/framework/errors";
import {
  DEFAULT_ASSISTANT_SETTINGS,
  loadAssistantSettings,
  type AssistantSettings,
} from "./settings.ts";

const PROVIDER = "openai-compatible";
const ENDPOINT_SETTING = "inference.openai.base_url";

interface BrowserInferenceOptions {
  readonly assistantTools?: InferenceToolProvider;
  readonly loadSettings?: () => Promise<AssistantSettings>;
  readonly fetch?: typeof globalThis.fetch;
}

export function createBrowserInferenceRuntime(
  options: BrowserInferenceOptions = {},
): InferenceRuntime {
  return new BrowserInferenceRuntime(options);
}

class BrowserInferenceRuntime implements InferenceRuntime {
  constructor(private readonly options: BrowserInferenceOptions) {}

  async *run(context: InferenceContext): AsyncIterable<InferenceEvent> {
    const [{ yair, ModelProviderRegistry }, { openAI }] = await Promise.all([
      import("@jthum/yair"),
      import("@jthum/yair-openai"),
    ]);
    let settings: AssistantSettings;
    let credential: string | undefined;
    try {
      if (context.model?.configId !== undefined) {
        // Persisted models use their own Workspace configuration, never profile credentials.
        const endpoint = await context.getSetting?.(ENDPOINT_SETTING);
        if (endpoint != null && (typeof endpoint !== "string" || !endpoint.trim()))
          throw invalidInput("The configured inference endpoint must be a URL.");
        settings = {
          baseUrl: typeof endpoint === "string" ? endpoint : DEFAULT_ASSISTANT_SETTINGS.baseUrl,
          model: context.model.model,
          apiKey: "",
        };
        if (context.model.credentialRef !== undefined) {
          credential =
            (await context.resolveCredential?.(context.model.credentialRef)) ?? undefined;
          if (!credential) throw invalidInput("The selected model's API key is not configured.");
        }
      } else {
        settings = await (this.options.loadSettings ?? loadAssistantSettings)();
        credential = settings.apiKey || undefined;
      }
    } catch (error) {
      yield { type: "started" };
      yield { type: "failed", error: asFrameworkError(error).toEnvelope() };
      return;
    }
    const runtime = yair({
      maxSteps: 32,
      provider: new ModelProviderRegistry(
        [
          {
            key: PROVIDER,
            provider: openAI({
              baseUrl: settings.baseUrl,
              apiKey: credential,
              defaultModel: settings.model,
              stream: true,
              ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
            }),
          },
        ],
        PROVIDER,
      ),
    });
    yield* runtime.run(
      context.metadata?.surface === "assistant" && this.options.assistantTools
        ? { ...context, tools: assistantGateway(context.tools, this.options.assistantTools) }
        : context,
    );
  }
}
