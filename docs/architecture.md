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

## Runtime layers

At a high level:

```text
Human UI ─────────────┐
                     │
WebMCP tools ─────────┼──> Runtime services ───> SQLite
                     │          ▲
Spec editor ─────────┘          │
                                │
                         Application spec
```

The runtime services are the important shared boundary.

A record mutation initiated from a form and the equivalent mutation initiated from WebMCP should pass through the same validation and persistence path.

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

Types become real SQLite tables. Fields become columns. Views become runtime queries. Pages compose widgets. Flows execute application behaviour.

When the spec evolves, the runtime reconciles its materialised state.

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

## Evolution policy

Builder.run is still pre-user and its application format is allowed to change cleanly. A schema change updates the model, runtime, editors, agent contracts, templates, tests, and documentation together. Previous shapes are rejected; they are not carried through converters, dual readers, deprecated fields, or hidden compatibility branches.

Add a migration only when real persisted user data creates a deliberate compatibility requirement. Until then, prefer one current representation and a lean implementation over speculative legacy support.
