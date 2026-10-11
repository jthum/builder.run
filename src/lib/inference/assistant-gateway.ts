import type {
  InferenceTool,
  InferenceToolGateway,
  InferenceToolProvider,
} from "@jthum/framework/kernel";
import { invalidInput, resourceNotFound } from "@jthum/framework/errors";

const SEARCH: InferenceTool = {
  id: "search_tools",
  name: "search_tools",
  label: "Search tools",
  description:
    "Find app-building, data and workflow tools. Matches are available on the next step.",
  input: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words describing the task or tool name." },
      limit: { type: "number", description: "Maximum matches; defaults to 8, up to 20." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

/** A host presentation of the authorized MCP catalog, not another inference loop.
 * Keep root-scoped Kernel tools out of a conversation targeting the selected App.
 * Execution always goes through the original Kernel gateway and its live re-checks. */
export function assistantGateway(
  gateway: InferenceToolGateway,
  provider: InferenceToolProvider,
): InferenceToolGateway {
  return {
    async resolve(context) {
      const definitions = await provider.resolve(context);
      const allIds = new Set(definitions.map((tool) => tool.id));
      const authorized = await gateway.resolve({ ...context, activeToolIds: allIds });
      const catalog = authorized.tools.filter((tool) => allIds.has(tool.id));
      const eagerIds = new Set(
        definitions.filter((tool) => tool.availability !== "discoverable").map((tool) => tool.id),
      );
      const tools = catalog.filter(
        (tool) => eagerIds.has(tool.id) || context.activeToolIds.has(tool.id),
      );
      const discoverable = catalog.filter((tool) => !eagerIds.has(tool.id));
      if (tools.length < catalog.length) tools.push(SEARCH);
      const offered = new Set(tools.map((tool) => tool.id));
      return {
        tools,
        async execute(call) {
          if (!offered.has(call.toolId)) throw resourceNotFound("InferenceTool", call.toolId);
          if (call.toolId !== SEARCH.id) return authorized.execute(call);
          const { query, limit = 8 } = call.input;
          if (typeof query !== "string" || !query.trim())
            throw invalidInput("Tool search query is required.");
          if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1)
            throw invalidInput("Tool search limit must be a positive integer.");
          const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
          const matches = discoverable
            .map((tool) => {
              const text = `${tool.id} ${tool.label} ${tool.description}`.toLocaleLowerCase();
              return {
                tool,
                score: terms.reduce((score, term) => score + Number(text.includes(term)), 0),
              };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score || a.tool.id.localeCompare(b.tool.id))
            .slice(0, Math.min(limit, 20))
            .map(({ tool }) => ({ id: tool.id, label: tool.label, description: tool.description }));
          return { query, tools: matches };
        },
      };
    },
  };
}
