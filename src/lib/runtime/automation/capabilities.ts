import { DEFAULT_AUTOMATION_REGISTRY } from "./registry.ts";
import type {
  AutomationCapability,
  AutomationCapabilitySupport,
  AutomationDefinition,
  AutomationRegistry,
  AutomationRuntimeProfile,
  AutomationStep,
} from "./model.ts";

export interface AutomationCompatibilityDiagnostic {
  capability: AutomationCapability;
  support: AutomationCapabilitySupport;
  message: string;
}

export interface AutomationCompatibilityResult {
  compatible: boolean;
  required: AutomationCapability[];
  diagnostics: AutomationCompatibilityDiagnostic[];
}

export const BROWSER_LOCAL_AUTOMATION_PROFILE: AutomationRuntimeProfile = {
  key: "browser-local",
  label: "Browser (local)",
  capabilities: {
    effects: "supported",
    loops: "supported",
    parallel: "emulated",
    retries: "emulated",
    compensation: "supported",
    durable_waits: "emulated",
    signals: "unsupported",
    schedules: "unsupported",
    webhooks: "unsupported",
  },
  notes: {
    parallel: "Branches execute deterministically in document order in the browser.",
    retries: "Retries do not survive closing or reloading the tab.",
    durable_waits: "Delays and timeout-only waits run only while the tab remains open.",
    signals: "The local runtime has no durable signal inbox.",
    schedules: "Schedules require a host that can wake while the app is closed.",
    webhooks: "A static browser app cannot receive inbound webhooks.",
  },
};

export function requiredAutomationCapabilities(
  workflow: Pick<AutomationDefinition, "trigger" | "steps">,
  registry: AutomationRegistry = DEFAULT_AUTOMATION_REGISTRY,
): AutomationCapability[] {
  const required = new Set<AutomationCapability>();
  const trigger = workflow.trigger?.key ?? "";
  if (trigger.startsWith("schedule.")) required.add("schedules");
  if (trigger.startsWith("webhook.")) required.add("webhooks");
  collect(workflow.steps, required, registry);
  return [...required];
}

function collect(
  steps: AutomationStep[],
  required: Set<AutomationCapability>,
  registry: AutomationRegistry,
): void {
  for (const step of steps) {
    if ("effect" in step) {
      required.add("effects");
      if ((step.effect.retry?.max ?? 1) > 1) required.add("retries");
      if (step.effect.compensate) required.add("compensation");
      for (const capability of registry.effects.get(step.effect.key)?.requires ?? []) {
        required.add(capability);
      }
    } else if ("gate" in step) {
      collect(step.gate.pass ?? [], required, registry);
      collect(step.gate.fail ?? [], required, registry);
    } else if ("foreach" in step || "repeat" in step) {
      required.add("loops");
      collect("foreach" in step ? step.foreach.steps : step.repeat.steps, required, registry);
    } else if ("parallel" in step) {
      required.add("parallel");
      for (const branch of step.parallel.branches) collect(branch.steps, required, registry);
    } else if ("delay" in step) {
      required.add("durable_waits");
    } else if ("wait" in step) {
      if (step.wait.signal) required.add("signals");
      if (step.wait.timeout !== undefined) required.add("durable_waits");
      collect(step.wait.on_signal ?? [], required, registry);
      collect(step.wait.on_timeout ?? [], required, registry);
    }
  }
}

export function checkAutomationCompatibility(
  workflow: Pick<AutomationDefinition, "trigger" | "steps">,
  profile: AutomationRuntimeProfile,
  registry: AutomationRegistry = DEFAULT_AUTOMATION_REGISTRY,
): AutomationCompatibilityResult {
  const required = requiredAutomationCapabilities(workflow, registry);
  const diagnostics = required
    .filter((capability) => profile.capabilities[capability] !== "supported")
    .map((capability) => ({
      capability,
      support: profile.capabilities[capability],
      message:
        profile.notes?.[capability] ?? `${profile.label} does not fully support ${capability}.`,
    }));
  return {
    compatible: diagnostics.every((item) => item.support !== "unsupported"),
    required,
    diagnostics,
  };
}
