# Builder.run

Builder.run is a local-first app builder for people and agents. Define the information you want to manage, then compose the forms, views, pages, and workflows that make it useful.

The application Spec is the portable definition of an app. Builder.run uses [Framework](https://github.com/jthum/framework) to validate and execute that definition, with browser-local or server-side SQLite and reusable Svelte editors.

## What you can build

- **Spaces and Apps** — independent Spaces with Apps and shared data.
- **Data and fields** — record types, relationships, validation, conditional inputs, and lifecycles.
- **Views** — saved queries with filtering, sorting, projections, and aggregation.
- **Forms** — create/edit forms and custom forms that collect information for workflows.
- **Pages and blocks** — dashboards and screens composed from content, metrics, charts, lists, tables, and actions.
- **Automations** — manual or event-triggered workflows using Framework Rules.
- **Portable Specs** — export and edit the application definition as YAML or JSON.

Defining a record type gives you storage, record screens, and basic create/edit forms. Add further structure as the app needs it.

## Build with an agent

The built-in **Assistant** can inspect and refine the selected app. Configure an OpenAI-compatible endpoint, model, and API key in profile settings. Inference runs through Framework and the demand-loaded YAIR runtime.

Builder.run also exposes tools through **WebMCP** when the browser provides that API. Authoring tools change the app definition; application tools let an external agent use its data and workflows. Both use Framework's validation and persistence operations.

The human interface works without an AI provider or WebMCP. See [WebMCP and agents](docs/webmcp.md).

## Local storage

SQLite runs in a browser worker. The runtime prefers OPFS, falls back to IndexedDB, and can use memory when persistent storage is unavailable. **Inspect** reports the selected backend and databases.

A central `catalog.db` holds Workspace and Actor state, Specs, and operational metadata. Record storage is routed into separate databases for Spaces, Apps, and scopes as needed. Data remains local to the browser profile; exporting a Spec does not export records or credentials.

See [Data and persistence](docs/data-and-persistence.md).

## Run locally

This checkout uses local package links to Framework and its optional packages. Clone [jthum/framework](https://github.com/jthum/framework) alongside this repository as `framework`, matching the links in [package.json](package.json).

```bash
vp install
vp dev
```

Quality checks:

```bash
vp check
vp run check
vp test
vp build
```

`vp check` runs formatting and linting; `vp run check` runs the project's Svelte/TypeScript diagnostics. The stack is SvelteKit, Svelte 5, TypeScript, Vite+, Tailwind CSS, shadcn-svelte/Bits UI, and browser SQLite.

## Deploy a Node server

Native Node deployment uses persistent SQLite and built-in login. With the linked Framework packages
built, use Node 24+ and run:

```bash
vp run build:server
export DATA_DIR=/absolute/path/to/builder-data
node build/setup.mjs
ORIGIN=http://localhost:3000 node build/index.js
```

Setup prompts once for the first user's name, username and password. Credentials belong in the
database, not deployment ENV settings. Startup requires a completed setup and never resets users.
Use an HTTPS reverse proxy and a process manager for a public deployment. Docker remains optional;
see [deployment](docs/deployment.md) for linked package builds, persistent storage and backups.

## Documentation

Start with the [documentation index](docs/README.md), or go directly to:

- [Getting started](docs/getting-started.md)
- [Core concepts](docs/concepts.md)
- [Building an app](docs/building.md)
- [WebMCP and agents](docs/webmcp.md)
- [Automations and workflows](docs/workflows.md)
- [Data and persistence](docs/data-and-persistence.md)
- [Architecture](docs/architecture.md)
- [Testing](docs/testing.md)
- [Local and server deployment](docs/deployment.md)

## Project status

Builder.run is under active development and remains pre-user. It supports browser-local and single-process Node server deployments. Framework supplies reusable Spec, Kernel, persistence, HTTP transport and Svelte integration contracts; Builder.run supplies the app-building experience, templates, block library, navigation, authentication and deployment composition.
