import type { RuntimeActionExecutor, SecretStore } from "@jthum/framework/kernel";

/** Browser-local secret storage. It masks values in Framework UI but is not encryption. */
export function browserSecrets(storage: Storage): SecretStore {
  const key = (ref: string) => `framework-secret:${ref}`;
  return {
    async get(ref) {
      return storage.getItem(key(ref));
    },
    async set(ref, value) {
      storage.setItem(key(ref), value);
    },
    async delete(ref) {
      storage.removeItem(key(ref));
    },
  };
}

/** A configurable proxy Action; its target still passes ordinary Action authorization. */
export const delegateAction: RuntimeActionExecutor = {
  kind: "delegate",
  async run(action, execution) {
    const settingKey = action.implementation.config.settingKey;
    if (typeof settingKey !== "string" || !settingKey.trim())
      throw new Error("Choose a setting containing the target Action key.");
    const target = await execution.getSetting(settingKey);
    if (typeof target !== "string" || !target.trim())
      throw new Error(`Setting ${settingKey} must contain an Action key.`);
    return execution.callAction(target, execution.input);
  },
};
