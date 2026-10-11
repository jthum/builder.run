import { createAesGcmSecretCipher, type SecretCipher } from "@jthum/framework/kernel";

const KEY = "builder-run-secret-key";

/**
 * Framework seals Workspace settings; this host supplies a browser-local key.
 * Keeping the key on the same device is not protection against scripts with origin access.
 * Invalid existing keys are not silently replaced. Losing the key requires re-entering secrets.
 */
export function browserSecretCipher(storage: Storage): SecretCipher {
  // Ordinary data does not require Web Crypto or key provisioning until a secret is used.
  let cipher: Promise<SecretCipher> | undefined;
  const open = () => (cipher ??= openCipher(storage));
  return {
    async encrypt(value, workspaceId, settingKey) {
      return (await open()).encrypt(value, workspaceId, settingKey);
    },
    async decrypt(value, workspaceId, settingKey) {
      return (await open()).decrypt(value, workspaceId, settingKey);
    },
  };
}

async function openCipher(storage: Storage): Promise<SecretCipher> {
  let encoded = storage.getItem(KEY);
  if (encoded === null) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    encoded = btoa(String.fromCharCode(...bytes));
    storage.setItem(KEY, encoded);
  }
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("The browser encryption key is invalid.");
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return createAesGcmSecretCipher(async () => key);
}
