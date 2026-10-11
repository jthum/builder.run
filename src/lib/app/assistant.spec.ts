import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { InferenceEvent, InferenceInput } from "@jthum/framework/kernel";

const mocks = vi.hoisted(() => ({
  run: vi.fn<(input: InferenceInput) => Promise<AsyncIterable<InferenceEvent>>>(),
  load: vi.fn(),
}));
vi.mock("./session.svelte.ts", () => ({
  session: { framework: { spaceClient: { runInference: mocks.run } } },
}));
vi.mock("$lib/inference/settings.ts", async (load) => ({
  ...(await load<object>()),
  loadAssistantSettings: mocks.load,
}));
import { AssistantState } from "./assistant.svelte.ts";

const SETTINGS = { baseUrl: "https://provider.test/v1", model: "model", apiKey: "secret" };
const context = (state: AssistantState, app = "app", space = "space", actor = "user") =>
  state.selectApp(app, space, actor);

function respond(events: (input: InferenceInput) => AsyncIterable<InferenceEvent>): void {
  mocks.run.mockImplementationOnce(async (input) => events(input));
}

describe("Assistant conversation state", () => {
  beforeEach(() => {
    mocks.load.mockReset().mockResolvedValue(SETTINGS);
    mocks.run.mockReset();
  });

  it("streams text and reasoning, shows tool activity, and replays full history on follow-up", async () => {
    const state = new AssistantState();
    context(state);
    const history = [
      { role: "user" as const, content: "Create a note." },
      {
        role: "assistant" as const,
        toolCalls: [{ id: "create", toolId: "builder:create_record", input: {} }],
      },
      {
        role: "tool" as const,
        callId: "create",
        toolId: "builder:create_record",
        output: { id: "note" },
      },
      { role: "assistant" as const, content: "Created a note." },
    ];
    respond(async function* () {
      yield { type: "reasoning_delta", step: 1, delta: "Use the record tool." };
      yield {
        type: "tool_call",
        step: 1,
        id: "create",
        toolId: "builder:create_record",
        input: {},
      };
      yield {
        type: "tool_result",
        step: 1,
        callId: "create",
        toolId: "builder:create_record",
        output: { id: "note" },
      };
      yield { type: "text_delta", step: 2, delta: "Created " };
      yield { type: "text_delta", step: 2, delta: "a note." };
      yield { type: "completed", output: "Created a note.", messages: history };
    });
    await state.send("Create a note.");
    expect(state.messages.at(-1)).toMatchObject({
      content: "Created a note.",
      reasoning: "Use the record tool.",
      tools: [{ label: "create record", status: "completed" }],
    });
    expect(mocks.run.mock.calls[0]?.[0]).toMatchObject({
      metadata: { surface: "assistant" },
      model: { provider: "openai-compatible", model: "model" },
    });
    expect(JSON.stringify(mocks.run.mock.calls[0]?.[0])).not.toContain("secret");
    respond(async function* () {
      yield { type: "completed", output: "Ready." };
    });
    await state.send("Continue.");
    expect(mocks.run.mock.calls[1]?.[0].messages).toEqual([
      ...history,
      { role: "user", content: "Continue." },
    ]);
    expect(state.running).toBe(false);
  });

  it("preserves the conversation through an inference-requested App switch", async () => {
    const state = new AssistantState();
    context(state);
    respond(async function* () {
      yield {
        type: "tool_call",
        step: 1,
        id: "create",
        toolId: "builder:create_app",
        input: { name: "New" },
      };
      context(state, "new");
      expect(state.messages).toHaveLength(2);
      yield {
        type: "tool_result",
        step: 1,
        callId: "create",
        toolId: "builder:create_app",
        output: null,
      };
      yield { type: "completed", output: "Created New." };
    });
    await state.send("Create an App.");
    expect(state.messages.at(-1)?.content).toBe("Created New.");
    expect(mocks.run.mock.calls[0]?.[0].signal?.aborted).toBe(false);
  });

  it("cancels and clears the conversation on a manual App change or a different Actor", async () => {
    for (const change of ["app", "actor"]) {
      const state = new AssistantState();
      context(state);
      respond(async function* () {
        yield { type: "text_delta", step: 1, delta: "Old context" };
        context(state, "new", "space", change === "actor" ? "other-user" : "user");
        yield { type: "completed", output: "Must not appear." };
      });
      await state.send("Work here.");
      expect(state.messages).toEqual([]);
      expect(mocks.run.mock.calls.at(-1)?.[0].signal?.aborted).toBe(true);
      expect(state.running).toBe(false);
    }
  });

  it("blocks concurrent sends while settings load", async () => {
    let resolve!: (settings: typeof SETTINGS) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const state = new AssistantState();
    context(state);
    respond(async function* () {
      yield { type: "completed", output: "Done." };
    });
    const first = state.send("First");
    await state.send("Second");
    resolve(SETTINGS);
    await first;
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(state.messages.filter((message) => message.role === "user")).toHaveLength(1);
  });

  it("retains successful mutations and inline failures when a turn ends at a step limit", async () => {
    const state = new AssistantState();
    context(state);
    respond(async function* () {
      yield {
        type: "tool_call",
        step: 1,
        id: "create",
        toolId: "builder:upsert_collection",
        input: {},
      };
      yield {
        type: "tool_result",
        step: 1,
        callId: "create",
        toolId: "builder:upsert_collection",
        output: { key: "note" },
      };
      yield { type: "tool_call", step: 2, id: "write", toolId: "builder:create_record", input: {} };
      yield {
        type: "tool_error",
        step: 2,
        callId: "write",
        toolId: "builder:create_record",
        error: { code: "VALIDATION.INVALID_INPUT", message: "Title is required." },
      };
      yield {
        type: "failed",
        error: { code: "INFERENCE.STEP_LIMIT", message: "Step limit reached." },
      };
    });
    await state.send("Build Notes.");
    expect(state.error).toBe("Step limit reached.");
    expect(state.messages.at(-1)?.tools).toMatchObject([
      { status: "completed" },
      { status: "failed", error: "Title is required." },
    ]);
    respond(async function* () {
      yield { type: "completed", output: "Continued." };
    });
    await state.send("Continue.");
    expect(JSON.stringify(mocks.run.mock.calls[1]?.[0].messages)).toContain(
      "upsert collection: completed",
    );
    expect(JSON.stringify(mocks.run.mock.calls[1]?.[0].messages)).toContain("Title is required.");
    expect(state.running).toBe(false);
  });
});
