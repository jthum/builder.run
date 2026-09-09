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
- create or change Forms and Workflows.

The exact tool set follows the implementation, but the important distinction is that these tools operate on **the application definition**.

## 2. Generated application tools

Once an app exists, builder.run derives a second tool surface from the live spec.

These tools let an agent operate the app itself:

- read exposed application data;
- create/update/delete records for exposed Types;
- apply the named lifecycle transitions currently available to a record;
- use exposed Views;
- invoke exposed callable Workflows.

When the application model changes, this capability surface can change with it.

In the default compact mode, changing a Type does not replace the registered CRUD schemas. Instead,
the agent discovers the current contract when it needs it:

```text
Agent adds `priority` to Project
          │
          ▼
Application spec changes
          │
          ├── UI now understands Project.priority
          └── describe_type({ type: "project" }) now includes priority
```

The agent can then immediately use the capability it just created.

This recursive loop is the main WebMCP idea behind builder.run:

> **Build the app with an agent. Then let the agent use the app it just built.**

## One runtime boundary

The human UI and WebMCP tools should not implement separate business logic.

Both call into the same application runtime services, so validation, persistence, references, and Workflow execution behave consistently whichever surface initiated the operation.

Page widgets follow the same rule. An agent can call `get_widgets` with a widget key and optional View key to discover required inputs and compatible fields. The same widget registry drives the human editor, agent discovery, safe defaults, and `upsert_page` validation, so adding a widget does not require a separate agent-specific contract.

Structured workflows are discoverable in the same way. `get_automation_primitives` returns the canonical composition shapes, registered condition and effect keys, their parameter contracts, and the active runtime capability profile. Agents should inspect it before `upsert_workflow` rather than guessing a widget- or domain-specific workflow shape.

WebMCP is therefore best understood as a **projection of the live spec**, not a second API.

## Scalable application tool projection

Generated per-Type CRUD tools are convenient for small applications: names such as
`create_invoice` are immediately legible, and their input schemas can describe every field. They do
not scale as the default, however, because the number and total schema size of registered tools grow
with the application model.

The default application surface is therefore a compact, stable set of generic operations:

```text
describe_type
list_records
get_record
create_record
update_record
delete_record
transition_record
```

`describe_type` supplies field constraints and lifecycle metadata on demand. The mutation tools pass
their type key and values to the same runtime validation used by the human interface. Agent-exposed
Workflows remain individually named because they communicate business intent rather than repeating
mechanical CRUD. If an application eventually exposes many Workflows, action discovery can use the same
list-and-invoke pattern.

An optional **typed tools** runtime setting projects per-Type aliases for small applications or
smaller models that benefit from explicit names and fully expanded schemas. This is a lightweight
adapter over the generic operations, not another implementation:

```text
create_invoice(input)      → create_record({ type: "invoice", values: input })
transition_invoice(input)  → transition_record({ type: "invoice", ...input })
```

Compact and typed modes replace one another rather than registering duplicate ways to perform the
same operation. In the browser runtime, enable **Typed WebMCP tools** in Space settings; the choice is
stored for that browser and applies across its apps. This setting belongs to the runtime or WebMCP
host—not the portable application spec—because it changes how a capability is advertised, not what
the application means. It should normally remain stable during an agent session to avoid unnecessary
tool-change churn.

## Tool lifecycle

The WebMCP registry should represent the application's **capability surface**, not its record contents.

That gives the runtime an important invariant:

```text
record created/updated/deleted
    → no tool-registry change

type/field/view/workflow exposure changes
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

Some instrumented browsers may emit a `reportAllChanges`/`startTime` console warning from a `VM…` or
`<anonymous>` script. This comes from browser-injected performance measurement rather than the
builder.run bundle and does not affect WebMCP operation. See the
[judge / reviewer test guide](testing.md#browser-injected-performance-warning) for details.

## Quick test

A useful end-to-end test is:

1. Open builder.run in a WebMCP-capable browser.
2. Confirm **Inspect** reports that an agent connection is available.
3. Ask the agent to inspect the current Space/app.
4. Ask it to create or modify an application through the builder tools.
5. Inspect the application tools. Compact mode is the default; optionally enable typed tools in Space
   settings for a small app.
6. Ask the agent to populate the new application through those tools.
7. Change the schema again (for example, add a choice field).
8. Confirm `describe_type` reports the new field and the agent can immediately use it. In typed mode,
   confirm the corresponding per-Type tool schema changes instead.

That sequence exercises the distinctive part of the project rather than only proving that a static tool can be called.
