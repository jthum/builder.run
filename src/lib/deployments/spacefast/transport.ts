const API = "https://api.spacefast.com";

/** Relay only Spacefast API requests. Other signed upload hosts keep their own scoped headers. */
export function spacefastRelayFetch(endpoint: string, send: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const original = input instanceof Request ? input : undefined;
    const target = new URL(
      original ? original.url : input instanceof URL ? input.href : (input as string),
    );
    if (target.origin !== API) return send(input, init);
    const headers = new Headers(init?.headers ?? original?.headers);
    const method = (init?.method ?? original?.method ?? "GET").toUpperCase();
    headers.set("x-relay-path", target.pathname + target.search);
    headers.set("x-relay-method", method);
    const body = ["GET", "HEAD"].includes(method)
      ? undefined
      : init?.body !== undefined
        ? init.body
        : await original?.clone().blob();
    return send(endpoint, {
      method: "POST",
      headers,
      body,
      credentials: "omit",
      redirect: "error",
      signal: init?.signal ?? original?.signal,
    });
  };
}
