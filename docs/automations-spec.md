# Automation language

Builder.run automations are portable application configuration. The browser is one consumer of the language, not the limit of what the language may express. The normative TypeScript contract is in `src/lib/runtime/automation/model.ts`; the JSON Schema is in `docs/schema/workflow.schema.json`.

There is one canonical representation. Editors author this representation directly and must preserve constructs they cannot edit. There is no shorthand document, graph IR, legacy reader, or conversion layer.

## Design

- Sequential work is an ordered `steps` array.
- Composition is nested where it is used: gates own branches, loops own bodies, waits own outcomes, and parallel steps own branches.
- Conditions and effects use stable registry keys rather than framework classes or arbitrary code.
- Pure `compute` and impure `effect` operations are distinct.
- Optional features add local detail; a simple action needs no workflow preamble.
- Language validity and host capability are separate questions.

## A simple action

```yaml
key: mark_invoice_paid
label: Mark invoice paid
input:
  invoice: { record: invoice }
expose: [ui, agent]
steps:
  - effect:
      key: records.set
      params:
        record: { $ref: vars.invoice }
        values: { status: paid }
```

Inputs are named. `{ record: invoice }` accepts an invoice ID and hydrates it to a record before execution. Scalar inputs use `{ value: text }`, `{ value: number }`, `{ value: boolean }`, `{ value: date }`, `{ value: object }`, or `{ value: array }`. Inputs are required unless `required: false`; optional scalar inputs may declare `default`.

Omitted `enabled` means true and omitted `priority` means zero. A definition without `trigger` is callable. `expose: [ui]` places a compatible callable action on records; `expose: [agent]` exposes the same execution path through WebMCP.

## Triggers and priority

```yaml
key: stamp_paid_date
label: Stamp paid date
trigger: { key: invoice.status.changed }
priority: 10
steps:
  - gate:
      predicate:
        op: context.equals
        path: vars.invoice.status
        value: paid
      pass:
        - effect:
            key: records.set
            params:
              record: { $ref: vars.invoice }
              values:
                paid_at: { $ref: meta.now }
```

Trigger keys are registered vocabulary. Builder.run currently dispatches `<type>.created`, `<type>.changed`, `<type>.<field>.changed`, `<type>.deleted`, and `form.submitted`. Set `trigger.config.form` to a form key when a workflow should listen to one form; its normalized answers arrive in `vars.values`. Portable hosts may add keys such as `schedule.cron` and `webhook.received`, with options under `trigger.config`. Matching automations run by descending priority.

## Context and bindings

Runs expose four conceptual namespaces:

```text
trigger  event key and payload
actor    initiating actor
vars     inputs, computed values, loop aliases, and effect results
meta     run metadata such as now
```

A sole-key object `{ $ref: vars.customer.id }` resolves to the typed value at that path. Resolution is recursive inside effect and invoke parameters. Ordinary strings are always literals; there are no magic expression strings.

An effect may save its result into `vars` with `as`:

```yaml
- effect:
    key: records.query
    params: { type: invoice, where: { status: overdue } }
    as: invoices
```

## Predicates and gates

Predicates are recursive trees:

```yaml
all:
  - { op: context.equals, path: vars.invoice.status, value: sent }
  - not: { op: context.empty, path: vars.invoice.customer }
```

Core condition keys are `always`, `context.equals`, `context.not_equals`, `context.in`, `context.filled`, `context.empty`, `context.compare`, and `context.contains`. A gate runs `pass` when true and `fail` when false, then continues with the next sibling step. Either branch may be omitted. `all: []` is true and `any: []` is false.

Equality is typed JSON equality: `1` is not equal to `"1"`; arrays compare in order; object key order is irrelevant. A missing path makes every leaf condition false except `context.empty`, which is true. Empty means null, a missing value, a blank string, or an empty array; `0` and `false` are filled. `context.in` uses typed equality. `context.contains` uses typed array membership or case-sensitive string containment. `context.compare` compares two numbers numerically or two strings lexically and rejects mixed types. Unknown operators fail execution rather than silently evaluating false.

## Compute and invoke

`compute` writes resolved values into `vars` without causing external effects:

```yaml
- compute:
    assign:
      owner_id: { $ref: vars.invoice.owner.id }
      reviewed: true
```

All assignments in one `compute` step resolve against the variables as they existed before that
step. They are then committed together, so sibling assignments do not depend on document order.

`invoke` composes another workflow through the same runtime and may capture its output:

```yaml
- invoke:
    workflow: notify_owner
    input:
      owner: { $ref: vars.invoice.owner }
    as: notification
```

Invocation depth is bounded by the host. Builder.run permits eight nested invocations and shares a 2,000-step budget across the whole call tree. Every visited step and retry attempt consumes one unit; exhausting the budget fails the run. Successful child-workflow compensations join the parent run's compensation stack, so a later parent failure unwinds the composed work in reverse completion order.

## Effects, retries, and compensation

Effects call host adapters by stable key. The core Builder.run host implements `records.create`, `records.set`, `records.delete`, `records.query`, and `null`. Other hosts may implement the same contract differently or provide more keys.

A published registry key identifies an immutable semantic contract. Breaking input, output, authorization, or effect semantics require a new key; a waiting run must never resume against a silently changed adapter contract.

```yaml
- id: charge_customer
  effect:
    key: billing.charge
    params:
      customer: { $ref: vars.customer.id }
      amount: { $ref: vars.total }
    as: charge
    retry:
      max: 3
      backoff: [0, 1]
    compensate:
      key: billing.refund
      params:
        charge: { $ref: vars.charge.id }
```

`retry.max` counts the initial attempt. Backoff values are seconds before subsequent attempts. Successful compensatable effects are unwound in reverse completion order if later execution fails. Durable hosts should record idempotency and compensation receipts using the workflow key, run ID, stable step ID, and loop instance. Step IDs are optional for simple authoring but should be supplied when durable identity matters.

## Loops

```yaml
- foreach:
    source: { $ref: vars.invoices }
    as: invoice
    max: 500
    on_item_failure: continue
    steps:
      - invoke:
          workflow: reconcile_invoice
          input: { invoice: { $ref: vars.invoice } }
```

`foreach` snapshots its source array before iteration. `repeat` accepts a non-negative integer or binding. Both default to a host-safe maximum of 1,000, expose `item` or zero-based `index` unless `as` is set, and default to stopping on an item failure. Loop aliases are lexically restored after the loop; other writes to `vars` remain.

## Parallel branches

```yaml
- parallel:
    join: all
    branches:
      - key: email
        steps:
          - { invoke: { workflow: send_email } }
      - key: audit
        steps:
          - { effect: { key: audit.record } }
```

`join` is `all` by default or `any`. Branches begin with the same variable snapshot. The observable merge is deterministic in document order with later successful branches winning conflicting variable writes. A host may execute independent branches concurrently only when it preserves that contract. The browser runtime currently emulates parallelism in document order.

Every branch is attempted. `all` fails if any branch fails; `any` succeeds when at least one branch
succeeds. Failed branches run their own compensation and do not contribute variable writes.

## Delay and wait

```yaml
- delay: { duration: 5 minutes }
- wait:
    signal: approved
    timeout: 2 days
    as: approval
    on_signal:
      - { invoke: { workflow: publish } }
    on_timeout:
      - { invoke: { workflow: expire } }
```

Durations are seconds or an integer followed by `seconds`, `minutes`, `hours`, or `days`. A durable host persists the definition snapshot, cursor, context, timer, and signal subscription. The local browser can emulate delays and timeout-only waits while its tab remains open; it cannot resume signals, schedules, or webhooks.

## Validation and portability

Structural validation rejects malformed composition, duplicate explicit step IDs, invalid limits, and invalid policies. A syntactically valid but unknown condition or effect key produces an unresolved-vocabulary warning: the document remains portable even when the current host lacks its adapter.

Runtime compatibility separately reports whether required capabilities are supported, emulated, or unsupported. Editors must surface incompatibility without rewriting the document.

## Editor contract

The Automations editor directly edits record and form triggers, gates, record effects, and the structured composition primitives above. A future node editor may project the same nested structure, but it must constrain connections to legal composition instead of introducing an independent graph format.

## State lifecycles and schema migrations

Record lifecycle is a separate type-level concern. A type declares its enum state field, initial and terminal states, and named allowed transitions. Automations can react to `<type>.<transition>.transitioned` events and add side effects, but they do not define which state changes are legal. See [Record lifecycles](lifecycles.md).

Schema migration is also separate. It needs source and target schema versions, preconditions, dry runs, checkpoints, audit history, and irreversible-operation policy. Neither lifecycle should be encoded as arbitrary automation effects.
