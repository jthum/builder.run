# Automations and workflows

Builder.run's **Automations** area edits Framework Rules. A workflow can run manually or respond to an event; both use the same canonical definition and runtime.

## Manual workflows

A Rule without a trigger runs on demand. It may declare inputs and be exposed to the human UI, agents, or both. For example, “complete project” can accept a Project record and update its status.

Commands need no result definition. If another workflow or agent needs a value, declare `result` and optionally an output contract.

## Event-triggered workflows

Record mutation Actions publish `record.created`, `record.updated`, `record.field_changed`, and `record.deleted`. A trigger can narrow its target using stable `sourceId` and `fieldId`.

Form submission publishes `form.submitted`. A Rule can select a Form using `formId`. Answers arrive in the trigger payload; Builder.run's Form authoring bridge supplies the friendly submission bindings used by the editor.

A Custom Form validates information without creating a record. Its related workflows decide whether to persist data or take another action. Create/edit Forms perform their declared record mutation and then publish the Form event.

Direct low-level record CRUD is deliberately quiet in Framework. Use mutation Actions or Form submission when event publication is required; callers should not assume every direct record write dispatches workflows.

## Composition

Steps can call Actions, assign variables, branch on conditions, invoke another Rule, loop, run parallel work, delay, or wait. Optional `as` captures a step result for later steps.

Actions use registered semantic keys. The canonical Spec stores `action.key` and `action.input`; the visual editor adapts friendly effect terminology to that shape. Unknown executable contracts fail runtime compatibility checks.

See [Canonical automation format](automations-spec.md) for examples and links to the language contract.

## Actor and authority

Steps inherit the execution Actor. An optional `runAs` chooses System or a semantic Actor binding resolved by the Workspace instance. The effective Actor must still have current authority for each operation.

Rule ownership does not implicitly grant the owner's permissions to a run.

## Runs and User requests

Builder.run enables Framework's durable Rule execution. A workflow with waits or User requests creates persisted execution state. The **Runs** screen at `/build/automations/runs` uses Framework's launcher, history, and inspector.

A User request collects structured input before continuing. Resuming a paused execution uses its saved definition and state. Framework provides the continuation mechanics; a deployment supplies scheduling, signals, and external event delivery.

## Lifecycles

A Collection lifecycle defines which state changes are legal. A workflow adds consequences around those changes, such as creating follow-up work or collecting approval.

See [Record lifecycles](lifecycles.md). Structural schema changes are handled by Spec validation and persistence reconciliation, separately from moving a record between lifecycle states.
