# Getting started

builder.run runs entirely in the browser. The current runtime is local-first: application structure and records are materialised locally, without requiring a backend service.

## Run the project

From the repository root:

```bash
vp install
vp dev
```

Open the URL printed by the development server.

Useful checks before committing or deploying:

```bash
vp check
vp test
vp build
```

## Browser support

For ordinary human use, builder.run does not require WebMCP.

For agent interaction during the WebMCP Challenge, use either:

- ChatGPT's in-app browser; or
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

When WebMCP is available, the **Inspect** screen shows the agent connection and the tools registered from the live spec.

## Create an app

You can start from a blank app or from one of the sample apps available in the UI.

The useful sequence is:

1. Define the **Types** the app needs.
2. Add fields and relationships.
3. Create useful **Views** over those records.
4. Compose **Pages** from widgets backed by those views.
5. Add **Automations** when the app needs explicit behaviour.
6. Use the app immediately; there is no separate code-generation or rebuild step.

Types provide strong defaults, so a small spec becomes useful quickly. A type can immediately produce storage, CRUD, basic forms, and navigation.

## Build with an agent

If the browser exposes WebMCP, an agent can perform the same process through builder.run's fixed builder tools.

For example:

> Build a judging workspace for a software hackathon. Track submissions and reviews, score each review across several criteria, and create useful dashboard pages and views.

The agent can create the application model first. builder.run then derives a second WebMCP surface from that model, allowing the agent to populate and operate the newly created app.

See [WebMCP and agents](webmcp.md).

## Export the application

Open **Export** to download or copy the application spec as YAML or JSON.

The spec is the portable **definition** of the app. It captures application structure and behaviour, not a complete backup of every record stored in the browser.

See [Data and persistence](data-and-persistence.md).
