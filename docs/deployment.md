# Deployment

Builder.run has two build modes. Both use the same Specs, editors, Views, Forms, Pages and Rules.
`VITE_DEPLOYMENT` is a build-time choice, not an automatic storage fallback.

## Native Node server

Native Node is the primary server deployment path. Docker is optional. Use Node 24 or later with
`node:sqlite` available. Install dependencies and build from this repository:

```bash
vp install
vp run build:server
```

Framework and its optional packages are pinned Git dependencies. Installation downloads and builds
them automatically; no sibling checkout, registry publication, or manual Framework build is needed.
The server build produces `build/index.js` and a separate `build/setup.mjs` command. Keep this
repository's installed `node_modules` alongside the build when running the app; copying only `build`
is not a complete deployment.

### Development

```bash
# Browser-local SQLite (default).
vp run dev

# Persistent server SQLite, with built-in login.
VITE_DEPLOYMENT=server DATA_DIR=./data vp run dev
```

Use the URL Vite prints and leave `ORIGIN` unset during local development. Production builds select
their mode at build time; `vp run start` runs a previously built Node server, not a static build.

### Optional Framework co-development

Only contributors changing Framework need a separate checkout. Build its packages there with
`vp install` and `vp run -r build`, then explicitly link the five packages from this repository:

```bash
vp link ../framework ../framework/packages/http ../framework/packages/sqlite/browser \
  ../framework/packages/inference/yair/core ../framework/packages/inference/yair/providers/openai
```

This writes local overrides into `pnpm-workspace.yaml` and updates the lockfile. Ordinary installs
never detect or use a sibling directory implicitly. To remove the local overrides and restore the
pinned dependencies, run `vp unlink`, then `vp install`. Keep local overrides out of commits.
Framework package builds should not run concurrently with this application's builds or tests.

Choose a persistent data directory and start the application:

```bash
export DATA_DIR=/absolute/path/to/builder-data
HOST=127.0.0.1 ORIGIN=http://localhost:3000 node build/index.js
```

Open `http://localhost:3000`. A fresh installation shows a one-time form for your name, username,
password and Space name. Submitting it creates the first Space/App and signs you in immediately;
there is no setup command or restart required. The chosen user receives ordinary management
Memberships. There is no default administrator username and no credential ENV setting. Passwords
are stored as salted scrypt hashes.

**Complete setup before exposing a fresh installation publicly.** The first successful submission
claims the installation; same-origin checks prevent cross-site submissions, not another visitor
opening the public setup page. Bind to `HOST=127.0.0.1` and use a local browser or SSH tunnel, or
keep access restricted at the proxy until setup is complete. For unattended provisioning, the
optional CLI below can complete setup before the server starts. Once complete, the browser setup
endpoint refuses further claims; additional users are managed by signed-in Space managers.

For a public deployment, set
`ORIGIN=https://your-domain.com` and put an HTTPS reverse proxy in front of the Node service. The
proxy must support streaming responses. Run Node under systemd or your preferred process manager,
as a dedicated non-root user with read/write access to `DATA_DIR`. `HOST` and `PORT` configure the
Node listener when needed.

Keep only infrastructure settings in deployment configuration: `DATA_DIR`, `ORIGIN`, `HOST` and
`PORT`. You can use Node's `--env-file` flag for these; the built server does not automatically load
`.env`. Do not put passwords in environment variables, process arguments or build arguments.

Starting an existing installation opens its persisted login realm and never resets users or
guesses an Actor from a roster. Invalid setup input creates no Workspaces or users and can be
corrected. Concurrent claims are serialized: only one can succeed. If initialization is interrupted
after creating instance data, setup/startup refuses to overwrite it; use a fresh directory or restore
a complete backup. A server holds the storage lease throughout onboarding as well as normal use.

### Optional terminal setup

Before starting the server, `node build/setup.mjs` (or `vp run setup:server`) asks for credentials
with password confirmation and hidden input. It uses the same provisioning code as browser setup.
Run it with the same `DATA_DIR`; it refuses an initialized directory before prompting and never
resets an existing password. Cancelled prompts leave no Workspaces or users and can be retried.

For trusted automation, `node build/setup.mjs --stdin` accepts a bounded JSON object with `name`,
`username`, `password` and optional `spaceName` through a private input pipe. Passwords are not
echoed. Obtain this input from your automation/secret manager, not a password embedded in shell
history. Without `--stdin`, the optional CLI prompts interactively.

Sessions use opaque random tokens in HttpOnly, SameSite cookies; tokens are hashed in storage.
Serve over HTTPS in production so cookies also receive `Secure`.

Mount `DATA_DIR` on persistent local storage. It contains `catalog.db`, routed record databases,
the server encryption key and login-realm configuration. Do not expose this directory as web assets.
SQLite's process lease excludes a second server using the same directory and releases on a crash;
normal shutdown closes the Kernel and all databases. Run one Node process/replica per data directory.
The UI can remain client-rendered: data, permissions, Rules and inference execute on the server.

## Optional Docker deployment

The optional Docker build installs the same pinned dependencies from this repository. No extra
Framework build context is required.

```bash
docker compose build
docker compose up -d
```

Open the app and complete browser setup while access is private, as for native Node. Alternatively,
before starting the service, run `docker compose run --rm --no-deps app node build/setup.mjs` for
optional terminal provisioning into the same `app-data` volume.
Compose publishes the port on loopback by default. Keep that private for setup; then serve it
through your HTTPS reverse proxy (or deliberately change the published binding).

The named `app-data` volume persists across container recreation. Set `ORIGIN` to the public URL
when serving through a reverse proxy; the proxy must support streaming responses. Do not scale
this service into multiple replicas over the same volume. The Dockerfile deliberately copies only
allowlisted source/build inputs, excluding local credentials and databases from both checkouts.

## Identity and additional users

Authentication is app-owned. Credentials are stored through Framework's module persistence, scoped
to their login realm; there is no Kernel Account or organisation-wide people table. Actors remain
issued in their Workspaces and are authorized through Memberships and Attachments. Creating another
independent Space explicitly links that newly issued Actor to the signed-in login; it does not grant
permissions to unrelated Workspaces. An Actor ID in a browser request is never trusted.

Space managers can open the **People and access** page from the user menu, add a user, and assign Space
and App permissions separately. New users default to Viewer access in the Space and current App.
Editor grants record creation, updates and deletion; Manager also grants definition and access
management. Custom permissions use the same five Kernel permissions, not another role system.
Only Apps the acting manager can manage appear; managing a Space never implies managing its Apps.
The host screen prevents changing your own access to avoid accidental lockout.

The roster supports server-side name/email search, permission and App-access filters, sorting,
and pages of 25, 50 or 100 people. Login usernames and App grants are loaded only for the displayed
page. Framework supplies optional roster/filter/permission components; login provisioning and
the Space/App access model remain app-owned. The local deployment has a read-only directory.

Copy the Space sign-in link and share it and the initial password privately. Logins are issued in
the selected Space, with usernames unique only within that realm. The link includes
`?realm=<workspace-id>` so users enter the correct login realm. Email delivery, invitations and
forgot-password recovery are not implemented. There is no deployment-configuration password reset
mechanism.
The browser remembers the authenticated login realm for the current tab after navigation and
sign-out. A different Space link overrides that hint; the login screen also offers the server's
default sign-in. These hints never grant authority.

Removing Space access blocks this login's direct App requests as well as navigation; it also signs
out realm-local login sessions. Actor identity, memberships and historical records are retained, so
access can be restored explicitly. This Space-entry check is host policy, not recursive Kernel ACL.
An administrator can also sign out a user's sessions without changing their memberships.

In **Profile → Security**, users can change their password, inspect active sessions, sign out one
other session, or sign out all other sessions. Password changes require the current password and
invalidate other sessions atomically. The current session stays signed in. Session lists contain
timestamps, not inferred device identities or authentication tokens.

## Refresh, inference and boundaries

The browser polls a lightweight, Space-scoped revision every three seconds while visible, then refreshes its
authorized context when something changes. This is invalidation, not a durable change feed or a
collaborative editor merge protocol. Concurrent whole-Spec edits remain last-writer-wins.
Server requests always check current authorization; permission revocation does not wait for polling.
Already-offered assistant tools also recheck the login session and selected Space/App access before
execution. Revocation does not undo effects that have already committed.

Inference streams through the optional `@jthum/framework-http` package. The server keeps each
conversation's selected App and tools isolated from other requests. Provider settings live on the
server; API keys are encrypted at rest and returned only as a mask. User-configured provider URLs
are outbound server requests: deployments with untrusted users should enforce their own network
egress policy. Persisted Agents use Workspace model configuration as usual.

Transport/session boundaries are in [`src/lib/server`](../src/lib/server). Reusable HTTP framing,
allowlisted Workspace operations and error handling live in Framework's optional HTTP package.
Browser local composition remains in the app session; editors consume the same client contract.

## Backup and restore

Stop the server before copying the entire data directory or taking a consistent volume snapshot.
Keep **all** routed databases, the login realm and `secret.key` together. The key is required to
decrypt stored credentials; protect backups as sensitive data. Restart with the restored directory.
Copying only `catalog.db`, or copying separate live files at different times, is not a complete
consistent backup. Online multi-file backups are outside this first deployment implementation.

Existing browser data is not automatically uploaded to a server. That is an explicit data transfer,
not a migration reader or storage-mode switch over the same database.
Server login storage is still greenfield: use a fresh data directory when testing against an older
experimental login schema. There are no legacy readers or automatic data resets. Browser-local
storage is unaffected.

## Deterministic verification

```bash
vp test src/lib/server --run
vp run build:server
vp run test:server
```

The process smoke verifies both optional private-stdin setup and browser setup over HTTP, including
immediate sign-in and refusal of repeat setup. It starts the production build with isolated temporary storage, tests login
and concurrent HTTP writes, kills/restarts the process, verifies persisted sessions/records, then
tests backup/restore, read-only user access, password changes and session revocation. It makes no browser or external provider calls and removes only its own
temporary test directories.

The same command also runs the [multiplayer workflow script](../scripts/server-workflow.mjs):
Form submission, assigned approval, acknowledged waiting checkpoint, process kill/restart,
completion as the initiating Actor, and refusal of unauthorized or duplicate responses. A second
run revokes the initiator's update permission while waiting and verifies that the reviewer's own
write permission cannot elevate the resumed Rule. Receipt assertions detect replay of pre-wait
effects. Run it independently with `vp run test:server:workflow`; it starts/stops its own server
and uses only temporary storage. This covers restart at a durable wait, not every possible
effect/checkpoint crash window.

The server contract tests additionally cover isolated login realms, live permission changes,
session revocation, password changes across restart, and an offered assistant tool paused across
revocation. The client parity test runs the same definition/field-rename, Form, View, Page and Rule
workflow through direct and HTTP clients. These are deterministic contract tests, not browser UI
or external provider tests.

## Browser-local deployment

```bash
vp install
VITE_DEPLOYMENT=local vp build
```

Serve `build` as a static SPA with `index.html` as the navigation fallback. The browser opens its
own OPFS/IndexedDB SQLite storage. There is no server setup, login or shared server data in this mode.

## Publish a generated app to Spacefast

The optional [Spacefast Zero target](../examples/spacefast-zero/README.md) builds an exported Spec
into a separate native Zero backend and Svelte app. Definitions change through redeployment;
application data stays in the target. It does not switch Builder.run's browser or Node storage.

```sh
vp run deploy:spacefast -- --spec /path/to/app.json --space spc_... --team TEAM_ID --owner you@example.com
```

Authenticate with Spacefast first and use a dedicated existing Space. The linked target guide
covers query budgets, supported model changes, native sign-in, and the current blocker to direct
publishing from an external static browser origin. The App switcher menu also offers **Deploy app** for direct browser
publishing with a user-supplied Spacefast key. Local preparation works; Spacefast currently needs
to enable cross-origin API access for the browser upload step. No publishing relay is required.
