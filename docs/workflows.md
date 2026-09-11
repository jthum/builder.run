# Automations and workflows

The product area is **Automations**. Each portable behavioural definition is a **Workflow**, whether it starts automatically or is invoked manually.

There is one canonical structured format, documented in the [automation language](automations-spec.md). The browser runtime, visual editor, imported/exported spec, templates, and WebMCP tools all consume that same structure.

## Callable workflows

A workflow without a trigger is an explicit action such as “mark project complete” or “approve expense”. It can be exposed to the human UI, to agents through WebMCP, or both. Both surfaces invoke the same runtime path.

## Triggered workflows

Adding a trigger makes the workflow respond to an application event. For example, an `invoice.status.changed` trigger can gate on the new value being `paid` and set `paid_at` to the run time.

`form.submitted` responds to validated form input. Its optional `config.form` selects one form, while `vars.values` contains that form's normalized answers. The event does not persist a submission by itself; record creation or external delivery is an explicit workflow step. Forms emit this event but do not embed workflow behavior, keeping business logic in one discoverable system.

## Composition

Workflows are ordered steps. A step may call a registered effect, compute variables, invoke another workflow, gate nested branches, iterate, run parallel branches, delay, or wait. The structure is recursive, so a simple workflow remains a short list while advanced behaviour pays complexity only where it uses it.

Registered effect and condition keys keep the document portable. A browser, Laravel application, or Convex-backed multiplayer host can implement a key with its own authorization and persistence adapter without changing the spec.

## Workflows and record state

Workflows supply behaviour around a record's journey but are not the authority for allowed state transitions. A record lifecycle belongs to its type definition: the state field, initial and terminal states, and named transitions are declarative type metadata. Workflows can respond to those transitions for notifications, assignments, audit work, or integrations.

The lifecycle shape and enforcement rules are documented in [Record lifecycles](lifecycles.md).

Schema evolution is a third concern with its own migration lifecycle. Keeping these contracts separate lets the system describe an information system without turning automation into arbitrary schema mutation.
