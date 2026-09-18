import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";
import { canonicalStudio } from "./canonical-studio.svelte.ts";
import { session, selectApp, selectSpace } from "./session.svelte.ts";

/** One feedback path for record buttons and action Blocks. */
export async function runWorkflow(
  key: string,
  input: Record<string, unknown>,
  label: string,
): Promise<void> {
  const selection = session.framework?.selection;
  try {
    const result = await canonicalStudio.runRule(key, input);
    if (result.mode === "short") {
      toast.success(label);
      return;
    }
    toast.success(
      result.execution.status === "waiting" ? "Workflow is waiting" : "Workflow completed",
      {
        action: {
          label: "View run",
          onClick: async () => {
            try {
              if (selection && session.framework?.space.id !== selection.spaceId)
                await selectSpace(selection.spaceId);
              if (selection && session.framework?.app.id !== selection.appId)
                await selectApp(selection.appId);
              await goto(`/build/automations/runs?run=${encodeURIComponent(result.execution.id)}`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Unable to open the run.");
            }
          },
        },
      },
    );
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Unable to run the workflow.");
  }
}
