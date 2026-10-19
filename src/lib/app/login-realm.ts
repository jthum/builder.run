const KEY = "server-login-realm";

/** A tab-local sign-in hint, never an identity or an authorization grant. */
export function readLoginRealm(
  storage: Pick<Storage, "getItem">,
  search: string,
): string | undefined {
  const parameters = new URLSearchParams(search);
  // An explicit empty realm selects the server's default sign-in, overriding a saved hint.
  if (parameters.has("realm")) return parameters.get("realm")?.trim() || undefined;
  try {
    return storage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function rememberLoginRealm(storage: Pick<Storage, "setItem">, realmId: string): void {
  try {
    storage.setItem(KEY, realmId);
  } catch {
    /* Sign-in remains available through the Space link without browser storage. */
  }
}
