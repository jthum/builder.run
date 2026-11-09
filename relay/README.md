# Standalone Spacefast relay

Copy **spacefast.mjs** and **server.mjs** together to any directory on a server with Node 24 or
later. No repository checkout, package.json, npm installation, Framework or Spacefast SDK is needed.

```sh
node server.mjs --origin https://builder.run
```

It listens on `127.0.0.1:8788`. Put it behind the existing HTTPS server for `builder.run`, for
example at `/relay/spacefast`. Keep it running with your normal process manager.

Example nginx location:

```nginx
location = /relay/spacefast {
    proxy_pass http://127.0.0.1:8788/;
    proxy_http_version 1.1;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 100s;
    client_max_body_size 32m;
}
```

Then build Builder.run with the public endpoint URL:

```sh
VITE_SPACEFAST_RELAY_URL=/relay/spacefast vp build
```

The same setting works with the Node/server build. It is a build-time setting: rebuild after
changing it. A relative URL uses Builder.run's own origin; an absolute HTTPS URL can point to a
separate relay deployment. No API key is configured on the relay. Each user supplies their own
Spacefast key in the Deploy dialog.

For local development, run the script with an explicit development origin and use its address:

```sh
node relay/server.mjs --origin http://localhost:5173 --port 8788
VITE_SPACEFAST_RELAY_URL=http://127.0.0.1:8788/ vp dev
```

Use the actual port/origin of your dev server. Repeat `--origin` to allow multiple exact origins.
Other options are `--host` and `--port`; PORT is also recognized for hosting platforms. Keep the
loopback binding when a reverse proxy fronts the process; use `--host 0.0.0.0` when a container or
platform needs to reach its listener.

## Responsibility

The browser still builds the app, hashes files, follows publish/upload receipts, retries, polls
and checks activation. The relay forwards one HTTP request at a time and streams the response.
It stores no credentials or artifacts and does not log request URLs, bodies or headers. The key
passes through its memory on the way to Spacefast. Disable credential/body logging and request
buffering in your hosting/proxy configuration too.

Only the publishing client's required Spacefast paths and methods are allowed. The upstream host
is fixed to api.spacefast.com. Browser origins are explicit, redirects are rejected, cookies are
excluded, and requests have a 32 MiB limit, a 90-second upstream timeout and a 16-request concurrency
limit per process. The browser keeps the retry intent; interrupted requests may already have
been accepted upstream and must be resumed rather than blindly recreated. Apply your normal
public-endpoint rate limits at the HTTPS proxy. Origin checks restrict browser callers; Spacefast's
key validation remains the authorization check.

Current native upload instructions use scoped authorization on the Spacefast API. If Spacefast
returns another upload host, the client sends that signed request directly to that host. A host
that also blocks browser CORS needs deliberate transport support; this relay does not accept an
arbitrary destination URL.

`spacefast.mjs` exports `createSpacefastRelay({ origins })`, returning a standard async
Request → Response handler. It can also be mounted in a Fetch-based server without the Node
wrapper. Optional handler parameters set maxBytes, timeoutMs, maxConcurrent and a fetch
implementation for testing. Create one handler per process/isolate so limits apply across requests.
No deployment orchestration or app-specific state lives here.

Electron/Tauri builds can instead inject native networking into the existing publisher and omit
the relay. Leaving VITE_SPACEFAST_RELAY_URL blank keeps the direct-browser transport; that still
requires Spacefast to permit its origin through CORS.
