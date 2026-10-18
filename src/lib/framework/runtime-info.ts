import type { Kernel, RuleRuntimeProfile } from "@jthum/framework/kernel";

export interface RuntimeInfo {
  readonly shortRules: RuleRuntimeProfile;
  readonly durableRules: RuleRuntimeProfile;
}

export function runtimeInfo(kernel: Kernel): RuntimeInfo {
  const shortRules = kernel.getRuleRuntimeProfile(
    new Set([
      "record.created",
      "record.updated",
      "record.deleted",
      "record.field_changed",
      "form.submitted",
    ]),
  );
  return {
    shortRules,
    durableRules: { ...kernel.getDurableRuleRuntimeProfile(), events: shortRules.events },
  };
}

export function encodeRuntimeInfo(info: RuntimeInfo) {
  const encode = (profile: RuleRuntimeProfile) => ({
    ...profile,
    actions: [...profile.actions],
    conditions: [...profile.conditions],
    events: [...profile.events],
  });
  return { shortRules: encode(info.shortRules), durableRules: encode(info.durableRules) };
}

export function decodeRuntimeInfo(info: ReturnType<typeof encodeRuntimeInfo>): RuntimeInfo {
  const decode = (
    profile: ReturnType<typeof encodeRuntimeInfo>["shortRules"],
  ): RuleRuntimeProfile => ({
    ...profile,
    actions: new Set(profile.actions),
    conditions: new Set(profile.conditions),
    events: new Set(profile.events),
  });
  return { shortRules: decode(info.shortRules), durableRules: decode(info.durableRules) };
}
