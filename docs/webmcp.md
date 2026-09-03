# WebMCP and agents

WebMCP is central to builder.run's architecture, not a wrapper added around a static application.

The runtime exposes **two different tool surfaces**.

## 1. Builder tools

Builder tools are stable capabilities provided by builder.run itself.

They let an agent inspect and mould the application model, including operations such as:

- inspect the active Space and app;
- inspect or export the current spec;
- create an app;
- add or update Types and fields;
- add or update Views;
- compose Pages and widgets;
- create or change Forms and Rules.

The exact tool set follows the implementation, but the important distinction is that these tools operate on **the application definition**.

## 2. Generated application tools

Once an app exists, builder.run derives a second tool surface from the live spec.

These tools let an agent operate the app itself:

- read exposed application data;
- create/update/delete records for exposed Types;
- use exposed Views;
- invoke exposed callable Flows.

When the application model changes, this capability surface can change with it.

For example:

```text
Agent adds `priority` to Project
          │
          ▼
Application spec changes
          │
          ├── UI now understands Project.priority
          └── Project WebMCP tool schema now includes priority
```

The agent can then immediately use the capability it just created.

This recursive loop is the main WebMCP idea behind builder.run:

> **Build the app with an agent. Then let the agent use the app it just built.**

## One runtime boundary

The human UI and WebMCP tools should not implement separate business logic.

Both call into the same application runtime services, so validation, persistence, references, and Flow execution behave consistently whichever surface initiated the operation.

WebMCP is therefore best understood as a **projection of the live spec**, not a second API.

## Tool lifecycle

The WebMCP registry should represent the application's **capability surface**, not its record contents.

That gives the runtime an important invariant:

```text
record created/updated/deleted
    → no tool-registry change

type/field/view/flow exposure changes
    → registry may change
```

This avoids noisy `toolchange` events and prevents an in-flight tool invocation from being invalidated just because ordinary application data changed.

## Exposure and control

Agent access is explicit.

Only capabilities that the spec exposes to agents should become agent-callable. Shared parent-Space data and app-local data remain distinct even when both appear in one app.

The current local runtime has one human administrator, but the underlying actor model leaves room for more precise permissions and ownership later.

## Browser requirements

For the WebMCP Challenge, use either:

- ChatGPT's in-app browser; or
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

Without WebMCP, builder.run remains a normal browser application and simply skips tool registration.

## Quick test

A useful end-to-end test is:

1. Open builder.run in a WebMCP-capable browser.
2. Confirm **Inspect** reports that an agent connection is available.
3. Ask the agent to inspect the current Space/app.
4. Ask it to create or modify an application through the builder tools.
5. Inspect the generated application tools.
6. Ask the agent to populate the new application through those tools.
7. Change the schema again (for example, add a choice field).
8. Confirm the generated tool schema changes and the agent can immediately use the new field.

That sequence exercises the distinctive part of the project rather than only proving that a static tool can be called.
