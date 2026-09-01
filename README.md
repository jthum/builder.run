# builder.run

The **application spec is the canonical product artefact**. This repository is the first browser runtime: a Svelte 5 / SvelteKit 3 app that materialises a spec into local software, and exposes the same capabilities to humans and agents.

```text
Agent ──WebMCP──> moulds application
                        │
                     App spec
                        │
Agent ──WebMCP──> uses resulting application
```

## Run

```bash
vp install
vp dev
```

Toolchain: Vite+, pnpm, `vp check`, `vp test`, `vp build`.

Open in Chromium, or ChatGPT’s built-in browser for WebMCP. Persistence prefers OPFS, then IndexedDB, then memory. The app works without WebMCP; tools simply do not register.

## Primitives

Environment → Workspaces → Stores, Types, Views, Forms, Flows, Pages.

- A type already produces storage, CRUD, a list view, create/edit forms, and navigation.
- A callable flow is a capability (`expose: [ui, agent]`).
- A triggered flow is an automation.
- Actors own roles. Every user is an actor; not every actor is a user. v1 has one local human admin.
- WebMCP is a projection of the live spec, not a second API.

## Demo

1. Load **Freelance CRM** from the gallery (or ask an agent to `create_workspace` with sample `freelance_crm`).
2. Create an organisation in the shared directory, then a project and invoice.
3. Invoke **Mark invoice paid** — `paid_at` is stamped by a triggered flow.
4. Mould the spec: add a `priority` enum on projects.
5. Export the YAML spec.

## Stack

SvelteKit 3 RC, Svelte 5, Tailwind 4, shadcn-svelte (Bits UI), wa-sqlite (present for the SQLite worker), OPFS/IndexedDB persistence.
