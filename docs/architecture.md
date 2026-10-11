# Architecture

Builder.run is an application built on [Framework](https://github.com/jthum/framework). Framework owns portable definitions, runtime semantics, authorization, persistence contracts, and reusable Svelte integration. Builder.run owns the app-building product experience.

## Runtime composition

```text
Builder.run editors, record screens, pages, and agent tools
                         │
                  WorkspaceClient
                         │
                  Framework Kernel
                         │
              persistence and inference contracts
                 │                   │
          SQLite adapter       YAIR + provider
                 │
           browser worker
```

Framework's [Spec model](https://github.com/jthum/framework/blob/main/src/spec/model.ts) and [validator](https://github.com/jthum/framework/blob/main/src/spec/validate.ts) define the canonical format. Its [Kernel](https://github.com/jthum/framework/blob/main/src/kernel/kernel.ts) composes focused services. The [WorkspaceClient](https://github.com/jthum/framework/blob/main/src/client/workspace-client.ts) exposes context-bound operations to UI and host code.

The reusable Svelte editors live in Framework's `svelte/authoring` integration; execution history and inspectors live in `svelte/operations`. Builder.run passes actions, theme styles, navigation, and product context into them.

## Spaces and Apps

Builder.run maps a Space to a root Workspace and an App to a child Workspace. The host creates the local user, chooses the current Space/App, and binds clients to that Actor's contexts.

Shared Collections live in the Space. Apps declare Sources and receive instance Attachments that resolve those Sources. Grouping columns describe Workspace relationships; access is checked at the relevant Workspace.

[bootstrap.ts](../src/lib/framework/bootstrap.ts) contains local bootstrap and selection. Its local Actor discovery must not be reused as server authentication. Framework's [deployment guidance](https://github.com/jthum/framework/blob/main/docs/deployment-modes.md) describes embedded and server hosts; Builder.run currently ships a browser-local deployment.

## Definition and identity

A canonical Spec has versioned arrays of Collections, Sources, Views, Forms, Pages, and Rules. Each definition retains its stable ID when a key or label changes.

Editors project the canonical definition into a working model and save it through Framework's authoring adapters. Export uses the canonical Spec directly. Instance identities and credentials are excluded from that export.

Optional `meta` JSON is preserved. Builder.run uses metadata for presentation and navigation conventions; runtimes may add their own information without changing core semantics.

## Persistence

[sqlite.ts](../src/lib/framework/sqlite.ts) composes Framework's SQLite adapter with Builder.run's gateway. The central `catalog.db` holds Workspace and Actor state, Specs, and operational metadata. Workspace and scope databases hold routed record storage.

The browser gateway uses Framework's optional browser SQLite package. A Node gateway supports deterministic tests. Framework's adapter owns physical names, field encoding, schema reconciliation, and SQL query compilation.

Tables and columns derive from stable IDs. Scalar fields use native SQLite values; structured fields use JSON text. Database filtering, sorting, and aggregation are handled through the adapter, including supported reference paths across routed databases. See [Data and persistence](data-and-persistence.md).

## Agent surfaces

[webmcp.ts](../src/lib/app/webmcp.ts) projects authoring and application tools from the active context. Record contents do not determine the advertised tool catalog.

The built-in Assistant uses [authoring-tools.ts](../src/lib/inference/authoring-tools.ts) to project those authoring operations into Framework's inference tool boundary. [runtime.ts](../src/lib/inference/runtime.ts) loads YAIR and an OpenAI-compatible provider when inference runs.

The Assistant and WebMCP are two host surfaces over the same canonical definitions. Their advertised tool names and input affordances can differ, so consult their respective implementations when extending them.

## Code map

| Concern                                         | Builder.run entry point                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Browser state and runtime composition           | [session.svelte.ts](../src/lib/app/session.svelte.ts)                   |
| Space/App bootstrap and selection               | [bootstrap.ts](../src/lib/framework/bootstrap.ts)                       |
| Framework SQLite routing and gateway adaptation | [sqlite.ts](../src/lib/framework/sqlite.ts)                             |
| Canonical authoring bridge                      | [canonical-studio.svelte.ts](../src/lib/app/canonical-studio.svelte.ts) |
| Product editor wrappers                         | [components](../src/lib/components)                                     |
| WebMCP tools                                    | [webmcp.ts](../src/lib/app/webmcp.ts)                                   |
| Assistant state                                 | [assistant.svelte.ts](../src/lib/app/assistant.svelte.ts)               |
| Inference composition                           | [inference](../src/lib/inference)                                       |
| Official blocks and lazy loading                | [registry.ts](../src/lib/blocks/registry.ts)                            |
| App templates                                   | [templates](../src/lib/app/templates)                                   |
| Collection starters                             | [collection-starters.ts](../src/lib/app/collection-starters.ts)         |
| Navigation and editor entries                   | [studio.ts](../src/lib/app/studio.ts)                                   |

## Development boundaries

Builder.run controls its product shell, templates, and host integration. Reusable Spec, Kernel, adapter, or editor changes belong in Framework when they apply across consumers.

This repository currently links Framework packages locally for active development. Public Framework references use its GitHub repository; consult the checked-out package version for exact APIs.

The project remains pre-user. Format changes should update the current model, editors, tools, templates, tests, and docs together. There is no requirement to preserve old shapes through compatibility readers.
