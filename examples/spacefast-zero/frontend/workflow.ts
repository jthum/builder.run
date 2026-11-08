import { toast } from "svelte-sonner";
import { canonicalStudio } from "./data.svelte.ts";

export async function runWorkflow(key: string, input: Record<string, unknown>, label: string) {
  try {
    const result = await canonicalStudio.runRule(key, input);
    toast.success(
      result.mode === "short"
        ? label
        : result.execution.status === "waiting"
          ? "Workflow is waiting"
          : "Workflow completed",
    );
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "Unable to run the workflow.");
  }
}
