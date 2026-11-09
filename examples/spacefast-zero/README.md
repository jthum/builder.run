# Spacefast generated app target

Builder.run remains the authoring app. This optional target compiles an exported canonical Spec
into native Zero tables/indexes, a real Framework Kernel backend, and an independently built Svelte
app. Deployed users work with records, Views, Forms, Pages and Rules. Authors change definitions
locally and publish another version. Browser-local SQLite and the Node/SQLite host are unchanged.

## Build and publish

Use Node and the repository's Vite+ toolchain. Authenticate with Spacefast once, then use a
**dedicated existing Zero Space** in the intended team:

```sh
vp install
npx spacefast@0.8.0 login
vp run deploy:spacefast -- --spec /path/to/app.json --space spc_... --team TEAM_ID --owner you@example.com
```

The command checks the destination team, builds the app, checks it with Spacefast's Zero compiler,
sets the non-secret `OWNER_EMAIL` configuration, waits for synchronization, publishes, and verifies
activation. It does not create Spaces, grant public access, upload browser records/secrets, or retry
failed publishes. The Spec is the exported canonical document, not an entire database backup.

The owner signs in using Spacefast with the configured verified email. Other verified identities
must match a previously created Framework User Actor and Membership. Guests and uninvited users
cannot access the Kernel. Private Space access and application Membership are separate checks.
Native authentication is provided by Spacefast; this app does not create another password store.

Build without publishing:

```sh
vp run build:spacefast -- --spec /path/to/app.json
```

Only `.output/spacefast-zero` is the publish root. Keep it separate from Builder.run's `build`
output. The generator replaces only that target directory. Without `--spec`, it builds the explicit
Task board verification fixture; `--revision=2` exercises stable identity across a key rename and
an optional field addition. Production publishing always requires an explicit Spec.

The installed Zero SDK and publishing CLI are both version 0.8.0. The CLI's automatic SPA detection
is disabled during publication: it attempts to change the fallback against the old version before
upload. Explicit `/p/*`, `/v/*`, `/t/*` and `/f/*` rewrites in the artifact preserve deep links.

## Verification

```sh
vp test examples/spacefast-zero --run
vp run check:spacefast
vp run build:spacefast -- --revision=2
node scripts/spacefast-kernel-smoke.mjs
```

The smoke executes the prepared backend module with the globals absent in Zero, including native
structuredClone and Web Crypto. Tests cover Kernel field validation, Forms, Views, grouped queries,
Rules, history, settings, invitation/permission checks, transaction failure, and model redeployment.
The source capsule is separately accepted by Spacefast's compiler during publishing.

Hosted HTTP verification uses a dedicated private test Space and **explicit `--test` builds only**.
The server-only `PROBE_TOKEN` override is disabled in ordinary builds and is never embedded in
frontend assets. `scripts/spacefast-kernel-live.mjs` exercises the real Kernel RPC; it removes only
its own test records/settings. It leaves completed Rule history. Temporary preview cookies and
tokens must stay out of logs, source, archives and Git. No browser automation is required.

On November 8, 2026, hosted checks passed for root HTML, its built module asset, deep links,
unauthorized denial, Kernel bootstrap, record validation/persistence, Form submission, indexed
Views, grouped queries, durable Rule execution/history, settings, and ActorRequest wait/respond/resume across separate
invocations. Native OAuth login itself
still needs a human check; the HTTP harness uses explicitly enabled test authentication.

## Direct browser publishing

Open the App switcher menu → **Deploy app**. The dialog and selected target load lazily.
Paste a Spacefast API key, connect, select your team and a dedicated existing Space (or create
one), enter the owner's verified email, and deploy. The key stays in memory for the dialog's
lifetime. It is never stored in localStorage or embedded in the generated app. With direct transport it
goes to Spacefast; when a relay is configured it passes through that service to Spacefast. The
dialog explains the configured connection. Only destination preferences are remembered locally.

**Prepare locally** works independently of the key/network connection to Spacefast. It generates
the native deployment in the browser and offers a credential-free deployment JSON download.
It contains app definitions/assets, so treat it like an app export. It is a diagnostic/interchange
artifact, not a static site directory or a file the generic archive uploader can serve directly.

Builder.run's normal build prepares a versioned runtime template using Spacefast's pinned SDK.
The end-user browser generates the schema, substitutes model data into that compiled template,
calculates native migrations/digests, and performs manifest publishing, signed file uploads,
finalization and activation checks. End users need no Node, CLI, WASM compiler, OPFS staging or
compiler service. The template is fetched compressed on demand and released when the dialog
closes. New targets have metadata plus independent dynamic imports and assets.

Retries within an open dialog retain the original publish intent/idempotency key and refresh
upload instructions. **Stop waiting** interrupts local waiting; it does not undo accepted writes.
Do not close/reload an uncertain deployment and blindly create another Space: inspect its current
status first. Already-created destinations are remembered immediately. Browser records and
stored credentials are not transferred by this flow.

### Current platform blocker

On November 8, Spacefast's API preflight still grants no `Access-Control-Allow-Origin` for
`https://builder.run`, localhost or the tested Space-hosted origin. It does grant access to its
own dashboard origin. A user-supplied key authorizes the API but cannot bypass this browser policy.
The direct transport therefore reports a connection failure on those origins today. To publish
from them now, deploy the [two standalone relay scripts](../../relay/README.md) and build with
`VITE_SPACEFAST_RELAY_URL=/relay/spacefast`. The relay forwards restricted HTTP requests; all
preparation, upload orchestration, retries and activation checks stay in the browser. Leaving
that setting blank retains direct access, which requires Spacefast to allow the calling origin.

The browser-generated artifact passed native schema, migration and digest equivalence checks and
was installed/activated on the dedicated test Space through the browser publisher's exact manifest
and signed-upload protocol. That live protocol test used a CLI-authenticated transport to avoid
extracting credentials; it does **not** claim that browser CORS succeeded. The regular CLI publish
command remains available independently.

```sh
vp run test:spacefast-browser
vp test src/lib/deployments/spacefast --run
```

The first command builds the template and compares browser output against the official SDK.
The second checks retry identity, scoped upload credentials, activation and destination protection.
`scripts/spacefast-browser-publish-live.mjs` is an opt-in native API check requiring explicit
`SPACEFAST_TEST_SPACE` and `SPACEFAST_TEST_TEAM`; it never creates a new Space.

See [adapter architecture and target limits](deployment/README.md).
