# Architecture

builder.run separates the portable application model from the runtime that executes it.

## Spec first

The canonical artefact is the application spec.

The browser implementation is one consumer of that spec, not the product definition itself.

```text
Application spec
      │
      ├──> Browser runtime
      │       ├── Svelte UI
      │       ├── SQLite materialisation
      │       └── WebMCP tool surface
      │
      └──> future runtimes / generators
```

A future hosted or native runtime should be able to consume the same semantic model while choosing different UI and persistence technologies.

## Portable identity

Durable spec definitions use opaque, stable 16-character base-62 IDs. The ID remains fixed when a human-readable key or label changes, which lets a runtime reconcile schema renames without treating the definition as deleted and recreated.

IDs are globally unique across the portable definition rather than carrying redundant type prefixes. The containing collection and schema already distinguish a type from a field, view, form, workflow, or page.

This convention applies only to spec nodes. Record, actor, run, database, and other operational identities belong to the runtime and are deliberately not prescribed by the portable spec.

## Optional metadata

The app spec and each durable spec definition may carry an optional `meta` JSON object. The core preserves this data without interpreting it. Runtimes may read and write their own optional information there using conventions that suit them:

```yaml
meta:
  wordpress:
    post_type: invoice
```

Metadata remains JSON-compatible so the complete spec can be exported and round-tripped. Runtime-specific metadata can supplement the portable definition without expanding the core vocabulary.

## Runtime layers

At a high level:

```text
Human UI ─────────────┐
                     │
WebMCP tools ─────────┼──> Runtime services ───> persistence contracts
                     │          ▲                       │
Spec editor ─────────┘          │                       └──> SQLite adapter
                                │
                         Application spec
```

The runtime services are the important shared boundary.

A record mutation initiated from a form and the equivalent mutation initiated from WebMCP should pass through the same validation and persistence path.

The browser runtime currently separates that boundary into three roles:

- `SpecService` owns authored spec mutations, reference-safe renames, and definition validation. It does not know how a runtime persists or materialises a spec.
- `RecordService` owns record operations, form submission, view execution, and the workflow cascade caused by data events.
- `PortableQueryExecutor` turns views into storage-neutral record query plans and completes relation traversal, projection, and aggregation above persistence.
- `Host` composes those services with a `RuntimePersistence` plug-in. Its commit path stages and validates spec changes, persists the catalog, reconciles record stores, rolls back failures, and only then publishes a new snapshot.

The persistence boundary is intentionally split by responsibility:

- `RecordStore` receives logical record operations against a `TypeDef`, rather than table names or SQL.
- `SchemaMaterializer` reconciles a set of portable Types with the active persistence technology. SQLite performs DDL; a schemaless runtime can implement different semantics.
- `CatalogRepository` persists runtime-owned spaces, actors, preferences, and specs.
- `RuntimePersistence` opens those components and reports the active implementation.

SQLite remains the reference adapter. Its catalog SQL, lower-level table engine, schema reconciler, worker, and gateway live together under `runtime/persistence/sqlite`. They are implementation details below these contracts rather than dependencies of forms, views, workflows, or `Host`.

Schema commits use four phases: validate every affected store, apply non-destructive additions and renames, save the catalog, and finally prune obsolete physical fields and collections. This keeps destructive cleanup out of the failure-sensitive portion of a multi-store commit. If cleanup itself fails, the accepted spec remains usable and the inaccessible physical leftovers can be pruned on a later reconciliation.

The UI and WebMCP use `Host` as the browser-runtime facade, but its methods are not part of the portable application format. A future runtime can provide a different facade while consuming the same canonical spec and preserving the same semantic contracts.

## Browser stack

The current implementation uses:

- SvelteKit 3 RC
- Svelte 5
- TypeScript
- Vite+
- Tailwind CSS 4
- shadcn-svelte / Bits UI
- `wa-sqlite`
- a dedicated SQLite Web Worker
- OPFS / IndexedDB / memory persistence adapters
- the WebMCP imperative API

No server is required for application data in this runtime.

## Materialisation

The spec does not merely describe a mock UI.

Types become real SQLite tables. Fields become columns. Views become runtime queries. Pages compose widgets. Workflows execute application behaviour.

When the spec evolves, the runtime reconciles its materialised state.

Record identity is allocated by the persistence engine when a record is inserted. The current SQLite engine uses its native integer primary keys and exposes them to the rest of the runtime as opaque strings. Other runtimes may use their own native identity strategy without changing the app spec or record service.

The runtime's `_meta` table is intentionally different: its text primary keys are the stable IDs of portable spec definitions used during schema reconciliation.

## Two WebMCP projections

builder.run exposes two categories of WebMCP tools.

### Builder projection

A stable set of tools operates on the application definition itself.

This lets an agent mould the software.

### Application projection

The current app spec is projected into tools for the domain the user created.

This lets an agent use the software.

The second surface is dynamic. A schema/exposure change may result in a different tool schema or tool set.

## Why this matters

Without the dynamic projection, builder.run would simply be an app builder that happens to expose a static automation API.

With it, WebMCP becomes part of the malleability model:

```text
agent changes software
        ↓
software exposes new capabilities
        ↓
agent uses those capabilities
```

The feedback loop is the architectural centre of the project.

## Current boundaries

This first runtime intentionally keeps several concerns narrow:

- application data is browser-local;
- there is one local human administrator;
- the spec export is not a full record-data backup;
- WebMCP remains an experimental browser capability;
- hosted multiplayer and cross-device persistence are future runtime concerns.

These are runtime boundaries, not reasons to bake browser-specific assumptions into the portable spec.

Persistence implementations are not expected to pretend that every technology has identical semantics. Realtime subscriptions, offline conflict handling, durable workflow execution, advanced joins, and analytical scans should be added as explicit capabilities when a concrete runtime needs them. The core contracts do not currently promise those behaviours. A reusable persistence contract suite checks the semantics that are promised today: catalog round-tripping, logical record CRUD and queries, schema materialisation, and data-preserving stable-ID renames.

## Evolution policy

Builder.run is still pre-user and its application format is allowed to change cleanly. A schema change updates the model, runtime, editors, agent contracts, templates, tests, and documentation together. Previous shapes are rejected; they are not carried through converters, dual readers, deprecated fields, or hidden compatibility branches.

Add a migration only when real persisted user data creates a deliberate compatibility requirement. Until then, prefer one current representation and a lean implementation over speculative legacy support.

The browser runtime therefore reads platform state only from its current SQLite catalog. It does not probe previous JSON stores or accept compatibility-only startup options.
