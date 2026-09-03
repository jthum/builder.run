# builder.run

**builder.run is a local-first application runtime that humans and agents can mould together.**

The application **spec is the canonical product artefact**. The browser runtime materialises that spec into a working app: real SQLite tables, forms, views, pages, rules, and an agent-facing capability surface.

The WebMCP integration has two layers:

```text
Agent
  │
  ├── builder tools ──> change the application spec
  │                         │
  │                         ▼
  │                    builder.run
  │                    materialises
  │                         │
  │              ┌──────────┴──────────┐
  │              ▼                     ▼
  │          Human UI          generated WebMCP tools
  │                                    │
  └────────────────────────────────────┘
                    uses the app
```

An agent can therefore **build an application and then immediately use the new tools created from the application it just built**.

## Why WebMCP

Most application integrations expose a fixed API designed separately from the product.

builder.run takes a different approach: WebMCP is a **projection of the live application spec**. When the spec changes, the application changes and its agent-facing tools can change with it.

This creates two complementary surfaces:

- **Builder tools** let an agent create and mould apps: types, fields, views, pages, widgets, forms, rules, and related primitives.
- **Application tools** are generated from the resulting app so an agent can work with its records, views, and exposed actions.

The human interface and agent tools meet at the same runtime boundary, rather than maintaining a second machine-only implementation.

## What the runtime can build

The current browser runtime supports:

- **Spaces and Apps** — apps can keep local data while reusing types exposed by their parent Space.
- **Types and fields** — including text, number, date, boolean, choice, and reference fields.
- **Views** — reusable filtered and ordered projections over application data.
- **Forms** — implicit create/edit forms from types, with custom forms where needed.
- **Pages and widgets** — dashboards and app screens composed from content, number cards, lists, tables, and bar/donut/line charts.
- **Rules (Flows)** — callable actions and triggered behaviour composed from runtime steps.
- **Actors** — the runtime models actions against an actor identity; this version starts with one local human administrator.
- **Portable specs** — export the application definition as YAML or JSON.

Types are intentionally powerful defaults: defining a type already gives the runtime enough information to create storage, CRUD, basic forms, and navigation.

## Local-first by design

Application data is stored in **SQLite inside the browser** using `wa-sqlite` in a worker.

Persistence falls back through:

1. OPFS
2. IndexedDB
3. in-memory SQLite

The catalogue tracks Spaces, actors, and the active Space. Application types materialise as real SQLite tables.

The current runtime is intentionally browser-local. A spec can be exported and imported elsewhere, but record data remains in the browser where it was created.

## Try it

For WebMCP-enabled agent interaction, use either:

- ChatGPT's in-app browser, where WebMCP is available for judging; or
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

The app itself does not require WebMCP. In a browser without the API, the human interface still works; agent tools simply are not registered.

See [WebMCP and agents](docs/webmcp.md) for a concise test flow.

## Run locally

```bash
vp install
vp dev
```

Useful development commands:

```bash
vp check
vp test
vp build
```

The project uses Vite+, pnpm, SvelteKit 3 RC, Svelte 5, Tailwind CSS 4, shadcn-svelte/Bits UI, and `wa-sqlite`.

## Documentation

- [Getting started](docs/getting-started.md)
- [Core concepts](docs/concepts.md)
- [Building an app](docs/building.md)
- [WebMCP and agents](docs/webmcp.md)
- [Rules and flows](docs/flows.md)
- [Data and persistence](docs/data-and-persistence.md)
- [Architecture](docs/architecture.md)
- [Judge / reviewer test guide](docs/testing.md)

## Project status

This repository is the first browser runtime for a broader schema-first application model. It is deliberately experimental: the goal is to test how far a small set of composable primitives can go when the same application can be shaped by a person or an agent.

The WebMCP integration is not an add-on to a finished app. It is part of the runtime model itself: **agents can mould the software, and the software can expose newly created capabilities back to agents.**
