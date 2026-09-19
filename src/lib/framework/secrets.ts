import type { SecretStore } from "@jthum/framework/kernel";

/** Browser-local secret storage. Values are masked by Framework APIs but are not encrypted. */
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
