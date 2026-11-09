// Standalone Web Request/Response handler. No SDK, storage or application dependencies.
const API = "https://api.spacefast.com";
const ID = "[A-Za-z0-9_-]+";
/** @type {Array<[string, RegExp]>} */
const routes = [
  ["GET", /^\/v1\/bootstrap$/],
  ["GET", /^\/v1\/spaces$/],
  ["POST", /^\/v1\/spaces$/],
  ["POST", /^\/v1\/publish$/],
  ["GET", new RegExp(`^/v1/operations/${ID}$`)],
  ["GET", new RegExp(`^/v1/spaces/${ID}(?:/db)?$`)],
  ["PUT", new RegExp(`^/v1/spaces/${ID}/variables/OWNER_EMAIL$`)],
  ["GET", new RegExp(`^/v1/spaces/${ID}/versions/${ID}$`)],
  ["POST", new RegExp(`^/v1/spaces/${ID}/versions/${ID}/(?:uploads/refresh|finalize)$`)],
  ["PUT", new RegExp(`^/v1/spaces/${ID}/uploads/${ID}$`)],
  ["POST", new RegExp(`^/v1/uploads/${ID}/files/${ID}/chunks$`)],
];
const controls = new Set(["x-relay-path", "x-relay-method"]);
const blockedRequestHeaders = new Set([
  "host",
  "cookie",
  "origin",
  "referer",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "expect",
  "forwarded",
  "accept-encoding",
]);
/** @param {string} name */
const requestHeader = (name) =>
  !controls.has(name) &&
  !blockedRequestHeaders.has(name) &&
  !["sec-", "proxy-", "x-forwarded-", "access-control-"].some((prefix) => name.startsWith(prefix));
/** @param {string} name */
const responseHeader = (name) =>
  ["content-type", "content-range", "etag", "retry-after", "www-authenticate"].includes(name) ||
  name.startsWith("x-spacefast-");

/**
 * @param {{origins: string[], fetch?: typeof fetch, maxBytes?: number, timeoutMs?: number, maxConcurrent?: number}} options
 */
export function createSpacefastRelay({
  origins,
  fetch: send = globalThis.fetch,
  maxBytes = 32 * 1024 * 1024,
  timeoutMs = 90000,
  maxConcurrent = 16,
}) {
  const allowed = new Set(
    origins.map((value) => {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol) || url.origin !== value)
        throw new Error("Configure exact HTTP(S) origins, without paths or trailing slashes.");
      return value;
    }),
  );
  if (!allowed.size) throw new Error("Configure at least one allowed browser origin.");
  let active = 0;
  /** @param {Request} request */
  async function relay(request) {
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "cache-control": "no-store",
      vary: "Origin",
      "x-content-type-options": "nosniff",
    });
    /** @type {(status:number, code:string, message:string)=>Response} */
    const error = (status, code, message) =>
      Response.json({ error: { code, message } }, { status, headers });
    if (!origin || !allowed.has(origin))
      return error(
        403,
        "RELAY.ORIGIN_DENIED",
        "This origin is not allowed by the publishing relay.",
      );
    headers.set("access-control-allow-origin", origin);
    headers.set(
      "access-control-expose-headers",
      "x-request-id, x-spacefast-commit-sha, retry-after",
    );
    if (request.method === "OPTIONS") {
      const requested = (request.headers.get("access-control-request-headers") ?? "")
        .toLowerCase()
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (
        request.headers.get("access-control-request-method") !== "POST" ||
        requested.some((name) => !controls.has(name) && !requestHeader(name))
      )
        return error(403, "RELAY.PREFLIGHT_DENIED", "Unsupported relay method or headers.");
      headers.set("access-control-allow-methods", "POST");
      headers.set("access-control-allow-headers", requested.join(", "));
      headers.set("access-control-max-age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST")
      return error(405, "RELAY.METHOD_DENIED", "Use POST for relay requests.");
    const path = request.headers.get("x-relay-path") ?? "";
    const method = request.headers.get("x-relay-method") ?? "";
    if (!path.startsWith("/v1/") || path.length > 8192)
      return error(400, "RELAY.INVALID_PATH", "A Spacefast API path is required.");
    let target;
    try {
      target = new URL(path, API);
    } catch {
      return error(400, "RELAY.INVALID_PATH", "Invalid Spacefast API path.");
    }
    if (
      target.origin !== API ||
      target.hash ||
      !routes.some(([verb, pattern]) => verb === method && pattern.test(target.pathname))
    )
      return error(
        403,
        "RELAY.PATH_DENIED",
        "This Spacefast operation is not supported by the relay.",
      );
    if (!/^Bearer \S+$/i.test(request.headers.get("authorization") ?? ""))
      return error(
        401,
        "RELAY.KEY_REQUIRED",
        "Supply your Spacefast key or scoped upload authorization.",
      );
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
      return error(413, "RELAY.BODY_TOO_LARGE", "This request exceeds the relay's upload limit.");
    if (active >= maxConcurrent) {
      headers.set("retry-after", "2");
      return error(503, "RELAY.BUSY", "The relay is busy. Resume this deployment shortly.");
    }
    const upstreamHeaders = new Headers();
    for (const [name, value] of request.headers)
      if (requestHeader(name)) upstreamHeaders.set(name, value);
    let bytes = 0,
      tooLarge = false;
    const body =
      !["GET", "HEAD"].includes(method) && request.body
        ? request.body.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                bytes += chunk.byteLength;
                if (bytes > maxBytes) {
                  tooLarge = true;
                  throw new Error("Upload limit exceeded.");
                }
                controller.enqueue(chunk);
              },
            }),
          )
        : undefined;
    if (!body) upstreamHeaders.delete("content-length");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    active++;
    let release = true;
    try {
      const options = {
        method,
        headers: upstreamHeaders,
        body,
        duplex: "half",
        signal,
        redirect: /** @type {RequestRedirect} */ ("manual"),
      };
      const upstream = await send(target, options);
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel();
        return error(502, "RELAY.REDIRECT_DENIED", "Spacefast returned an unexpected redirect.");
      }
      for (const [name, value] of upstream.headers)
        if (responseHeader(name)) headers.set(name, value);
      const requestId = upstream.headers.get("x-request-id");
      if (requestId) headers.set("x-request-id", requestId);
      // Keep the concurrency slot until the response is consumed or cancelled.
      if (!upstream.body) return new Response(null, { status: upstream.status, headers });
      const reader = upstream.body.getReader();
      let finished = false;
      const finish = () => {
        if (!finished) {
          finished = true;
          active--;
        }
      };
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const result = await reader.read();
            if (result.done) {
              finish();
              controller.close();
            } else controller.enqueue(result.value);
          } catch {
            finish();
            controller.error(new Error("The publishing relay stream was interrupted."));
          }
        },
        async cancel(reason) {
          finish();
          await reader.cancel(reason);
        },
      });
      release = false;
      return new Response(stream, { status: upstream.status, headers });
    } catch {
      if (tooLarge)
        return error(413, "RELAY.BODY_TOO_LARGE", "This request exceeds the relay's upload limit.");
      if (signal.aborted)
        return error(
          504,
          "RELAY.TIMEOUT",
          "The relay request was interrupted or timed out. Resume the existing deployment before starting another.",
        );
      return error(
        502,
        "RELAY.UPSTREAM_FAILED",
        "Could not reach Spacefast. The request may have been accepted; resume the existing deployment.",
      );
    } finally {
      if (release) active--;
    }
  }
  return relay;
}
