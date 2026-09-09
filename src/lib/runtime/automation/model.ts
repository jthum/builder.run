import type { SpecNode } from "../spec-node.ts";

export interface AutomationBinding {
  $ref: string;
}

export type AutomationValue =
  | null
  | boolean
  | number
  | string
  | AutomationBinding
  | AutomationValue[]
  | { [key: string]: AutomationValue };

export type AutomationPredicate =
  | { all: AutomationPredicate[] }
  | { any: AutomationPredicate[] }
  | { not: AutomationPredicate }
  | AutomationCondition;

export type AutomationCondition = { op: string } & Record<string, AutomationValue>;

export type AutomationInput =
  | { record: string; required?: boolean }
  | {
      value: "text" | "number" | "boolean" | "date" | "object" | "array";
      required?: boolean;
      default?: AutomationValue;
    };

export interface AutomationTrigger {
  /** Stable registry key, for example `invoice.status.changed` or `schedule.cron`. */
  key: string;
  config?: Record<string, AutomationValue>;
}

export interface AutomationRetry {
  /** Total attempts, including the initial attempt. */
  max: number;
  /** Delay in seconds before each retry. Browser runtimes may emulate this in-session. */
  backoff?: number[];
}

export interface AutomationEffectCall {
  key: string;
  params?: Record<string, AutomationValue>;
}

export interface AutomationEffect extends AutomationEffectCall {
  as?: string;
  retry?: AutomationRetry;
  compensate?: AutomationEffectCall;
}

interface StepIdentity {
  /** Optional stable identity for traces, retries, waits, and idempotency. */
  id?: string;
}

export type AutomationStep =
  | (StepIdentity & {
      gate: {
        predicate: AutomationPredicate;
        pass?: AutomationStep[];
        fail?: AutomationStep[];
      };
    })
  | (StepIdentity & { compute: { assign: Record<string, AutomationValue> } })
  | (StepIdentity & { effect: AutomationEffect })
  | (StepIdentity & {
      invoke: { workflow: string; input?: Record<string, AutomationValue>; as?: string };
    })
  | (StepIdentity & { delay: { duration: number | string } })
  | (StepIdentity & {
      wait: {
        signal?: string;
        timeout?: number | string;
        as?: string;
        on_signal?: AutomationStep[];
        on_timeout?: AutomationStep[];
      };
    })
  | (StepIdentity & {
      foreach: {
        source: AutomationBinding;
        as?: string;
        max?: number;
        on_item_failure?: "stop" | "continue";
        steps: AutomationStep[];
      };
    })
  | (StepIdentity & {
      repeat: {
        times: number | AutomationBinding;
        as?: string;
        max?: number;
        on_item_failure?: "stop" | "continue";
        steps: AutomationStep[];
      };
    })
  | (StepIdentity & {
      parallel: {
        branches: Array<{ key?: string; steps: AutomationStep[] }>;
        join?: "all" | "any";
      };
    });

export interface AutomationDefinition extends SpecNode {
  key: string;
  label: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  input?: Record<string, AutomationInput>;
  trigger?: AutomationTrigger;
  expose?: Array<"ui" | "agent">;
  steps: AutomationStep[];
}

export interface AutomationRunContext {
  trigger: { key: string | null; payload: Record<string, unknown> };
  actor: { kind?: string; id?: string | number | null } | null;
  vars: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export interface AutomationRegistryItem {
  key: string;
  label: string;
  description?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  icon?: string;
  requires?: AutomationCapability[];
}

export interface AutomationRegistry {
  conditions: ReadonlyMap<string, AutomationRegistryItem>;
  effects: ReadonlyMap<string, AutomationRegistryItem>;
}

export type AutomationCapability =
  | "effects"
  | "loops"
  | "parallel"
  | "retries"
  | "compensation"
  | "durable_waits"
  | "signals"
  | "schedules"
  | "webhooks";

export type AutomationCapabilitySupport = "supported" | "emulated" | "unsupported";

export interface AutomationRuntimeProfile {
  key: string;
  label: string;
  capabilities: Record<AutomationCapability, AutomationCapabilitySupport>;
  notes?: Partial<Record<AutomationCapability, string>>;
}
