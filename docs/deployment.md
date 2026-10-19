# Deployment

Builder.run has two build modes. Both use the same Specs, editors, Views, Forms, Pages and Rules.
`VITE_DEPLOYMENT` is a build-time choice, not an automatic storage fallback.

## Browser-local

```bash
vp install
VITE_DEPLOYMENT=local vp build
```

Serve `build` as a static SPA with `index.html` as the navigation fallback. The browser opens its
own OPFS/IndexedDB SQLite storage. There is no server login or shared server data in this mode.

## Node server

Use Node 24 or later with `node:sqlite` available. Build Framework and its optional HTTP, browser
SQLite and YAIR packages first when using the active linked checkout.

```bash
vp install
VITE_DEPLOYMENT=server vp build
DATA_DIR=./data SERVER_ADMIN_USERNAME=admin SERVER_ADMIN_PASSWORD='<a strong password>' \
  ORIGIN=http://localhost:3000 node build/index.js
```

Alternatively load server-only configuration using Node's `--env-file` flag. The built server does
not automatically load `.env`. Do not put secrets in `VITE_` variables or build arguments.

The first successful initialization creates the initial Space/App, issues its owner Actor, and
stores a salted scrypt password hash. The bootstrap password is required only for that first login;
changing the environment variable later does not reset an existing password. Sign in through the
app. Sessions use opaque random tokens in HttpOnly, SameSite cookies; tokens are hashed in storage.
Serve over HTTPS in production so cookies also receive `Secure`.

Mount `DATA_DIR` on persistent local storage. It contains `catalog.db`, routed record databases,
the server encryption key and login-realm configuration. Do not expose this directory as web assets.
SQLite's process lease excludes a second server using the same directory and releases on a crash;
normal shutdown closes the Kernel and all databases. Run one Node process/replica per data directory.
The UI can remain client-rendered: data, permissions, Rules and inference execute on the server.

## Container

The build uses the sibling Framework checkout as a named build context. Docker BuildKit and a
Compose version supporting `additional_contexts` are required.

```bash
SERVER_ADMIN_PASSWORD='<a strong password>' docker compose up --build -d
```

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

Space managers can open **People and access** from the user menu, add a user, and assign Space
and App permissions separately. New users default to Viewer access in the Space and current App.
Editor grants record creation, updates and deletion; Manager also grants definition and access
management. Custom permissions use the same five Kernel permissions, not another role system.
Only Apps the acting manager can manage appear; managing a Space never implies managing its Apps.
The host screen prevents changing your own access to avoid accidental lockout.

Copy the Space sign-in link and share it and the initial password privately. Logins are issued in
the selected Space, with usernames unique only within that realm. The link includes
`?realm=<workspace-id>` so users enter the correct login realm. Email delivery, invitations and
forgot-password recovery are not implemented. The bootstrap environment password is not a reset
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
VITE_DEPLOYMENT=server vp build
vp run test:server
```

The process smoke starts the actual production build with isolated temporary storage, tests login
and concurrent HTTP writes, kills/restarts the process, verifies persisted sessions/records, then
tests backup/restore, read-only user access, password changes and session revocation. It makes no browser or external provider calls and removes only its own
temporary test directories.

The server contract tests additionally cover isolated login realms, live permission changes,
session revocation, password changes across restart, and an offered assistant tool paused across
revocation. The client parity test runs the same definition/field-rename, Form, View, Page and Rule
workflow through direct and HTTP clients. These are deterministic contract tests, not browser UI
or external provider tests.
