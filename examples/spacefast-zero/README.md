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

## Browser publishing status

Direct publishing from an external static origin is currently blocked: Spacefast's publish API
preflight does not grant access to `https://builder.run` or localhost. The supported Zero compiler
also runs through Node tooling. One-click browser publishing therefore needs a supported browser
integration/remote compiler from Spacefast, or an optional authenticated publishing relay. The
local command above is usable independently. No disabled Deploy button, relay requirement, or
Spacefast-specific restriction has been imposed on the main app or Framework.

See [adapter architecture and target limits](deployment/README.md).
