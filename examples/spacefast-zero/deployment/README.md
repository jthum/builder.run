# Zero persistence and generated app

The target implements existing Framework persistence ports. It does not create a second Spec or
an alternative authorization, Form, lifecycle, View or Rule engine. The generated server calls the
actual Kernel through Framework's allowlisted HTTP protocol; the frontend uses WorkspaceClient.

## Source map

- `compile.ts`: canonical Spec validation, stable physical names and literal native schema/indexes.
- `records.ts`: native scalar encoding, indexed reads and logical query evaluation.
- `catalog.ts`: indexed catalog metadata, staged transaction callbacks and shared Core invariants.
- `configuration.ts`: Workspace/Scope instance configuration, including already-sealed payloads.
- `executions.ts`: separate durable execution bodies, history summaries, and ActorRequests.
- `subscriptions.ts`: indexed Workspace/scope/event Rule lookup.
- `persistence.ts`: composes the existing PersistenceSession ports and schema lifecycle checks.
- `kernel-runtime.ts`: request-bound Kernel, deployment bootstrap, native-identity binding and IDs.
- `transaction.ts`: native write failure propagation across higher-level error formatting.
- `rpc.ts` / `methods.ts`: allowlisted read/write dispatch and deployment-owned model changes.
- `compatibility.ts` / `intrinsics.ts`: target-only cloning/UTF-8 services for Zero's restricted host.
- `../frontend`: generated app shell using the shared record/forms/views/blocks UI.

The small shared `WorkspaceData` host binding is also used by Builder.run. The generated frontend
binds it to authenticated HTTP clients instead of the authoring session. It does not load browser
SQLite or the editors. Block components load lazily; target imports never enter the ordinary app
build. The optional SDK/build dependencies do not become Framework Core dependencies.

## Storage and queries

Physical names derive from stable definition IDs. Semantic key renames preserve native columns
and stored data. Compilation checks physical collisions. Native Zero record IDs remain distinct
from Framework IDs; every row lookup/query includes the supplied Workspace restriction.

Text, choices, references, dates and datetimes use native strings; numbers and booleans use native
Zero values. Structured JSON and multiple choices/references use JSON text. A stable-ID null bitmap
preserves absent optional fields versus explicit null. Exact decimals have no separate logical
Framework type: existing logical number semantics apply. Date normalization remains the Kernel's
logical Field behavior. Catalog/configuration/checkpoint payloads are JSON instance metadata.

Required identity/creation-order indexes and compatible View query shapes are generated; scalar
fields are not all indexed automatically. Native numeric/boolean filtering and required scalar
ordering use matching native indexes. Pagination advances native cursors instead of relying on
`take`, which clamps its result count. Count and retrieval build independent query objects because
the SDK resets a query after terminal calls.

Other logical predicates, text/nullable ordering, grouped aggregates and relationship queries use
Framework's canonical evaluator inside this adapter. The target reads only the selected Workspace's
root Collection and authorized referenced records, with a 10,000-row evaluation/read budget.
Exceeding the budget fails explicitly; results are never silently truncated. Kernel-provided
relationship restrictions are applied before exposing related values. SQL adapters continue to use
SQL; this target's strategy is not a global Framework fallback or a performance claim.

## Transactions and identity

Each native Zero endpoint owns the parent transaction. Catalog callbacks stage their small write
set, expose it to reads during the callback, and flush only after success. Configuration callbacks
compute before their single write. Native write failures poison the enclosing request and escape
RPC error formatting so Zero rolls back. Bootstrap failures after mutation also abort the parent.
Ordinary domain failures retain Framework's operation/Rule effect semantics.

A build-time random release identity plus a transactionally updated native sequence supplies
Framework IDs without requiring unavailable runtime entropy. Identity strings do not confer
permission. `auth_links` binds a native provider/subject to an Actor. Verified email can bind an
existing invited User once; subsequent access still requires Membership. The deployment owner is
configured server-side. Native guests are never treated as members merely because they have IDs.

The restricted runtime lacks some browser/Node globals. The server build injects lexical clone
and UTF-8 implementations only where needed; it does not expose a host global object or replace
Framework's normal browser/Node services. Unexpected errors retain their original cause even when
an optional diagnostic ID cannot be generated.

## Deployment limits

- Runtime model edits are rejected with `PERSISTENCE.UNSUPPORTED`; redeploy definitions instead.
- Zero 0.8 publishes additive schemas. Stable-ID key renames and optional additions are verified.
  Removed tables/fields/indexes, storage-type changes and required-field backfills need explicit
  deployment planning. Native preflight/publication rejects incompatible changes. CLI `db migrate`
  destructive flags preview intent; they do not apply source removals. Do not promise otherwise.
- The generated host installs no module-owned persistence modules or custom host Actions/Blocks.
  Those need an explicit target implementation when used by an app.
- Inference and scheduled triggers are unavailable in this target host. Calls receive capability
  errors. Durable execution/history and ActorRequests persist; timed waits need an external
  resumer. There is no in-process background scheduler in Zero.
- The store can preserve sealed settings. This host has no SecretCipher/key service configured,
  so creating new encrypted secrets requires additional host integration.
- Browser records, shared-root Attachments and encrypted settings are not implicitly imported by
  a Spec deployment. Data transfer is separate from portable definitions.
- The default app shell exposes records, Views, Forms and Pages, including action Blocks that run
  Rules. Membership management and operational inspectors remain available through authorized
  client APIs; this shell does not yet provide administration screens for them.

These are explicit properties of this target, not reductions in Framework or existing deployment
modes. Read [build/publish commands and browser integration status](../README.md) before use.
