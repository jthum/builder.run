# Canonical automation format

Builder.run saves automations as Framework `RuleDefinition` objects in the App Spec's `rules` array.

The current contract is Framework's [Spec model](https://github.com/jthum/framework/blob/main/src/spec/model.ts), checked by its [validator](https://github.com/jthum/framework/blob/main/src/spec/validate.ts). See [Rules and Actions](https://github.com/jthum/framework/blob/main/docs/rules.md) for full execution semantics. Builder.run does not maintain a separate workflow JSON Schema.

## A manual action

This Rule fragment assumes a Project Collection with ID `A000000000000010` and a status Field with ID `A000000000000011`, whose choices include `complete`:

```yaml
id: A000000000000012
key: complete_project
label: Complete project
input:
  project:
    sourceId: A000000000000010
    required: true
expose: [ui, agent]
steps:
  - id: A000000000000013
    action:
      key: records.update
      input:
        record:
          $ref: vars.project
        values:
          A000000000000011: complete
```

Source inputs accept a record ID and resolve it to a record before the steps run. Action value maps use stable Field IDs; direct record and Form inputs use field keys.

Definition, step, and branch IDs are stable. Editors assign them automatically. Preserve existing IDs when editing exported definitions.

## Events

Canonical triggers use `event`, with optional `sourceId`, `fieldId`, and `formId`:

```yaml
trigger:
  event: record.created
  sourceId: A000000000000010
```

Built-in record mutation events are `record.created`, `record.updated`, `record.field_changed`, and `record.deleted`. Form submission emits `form.submitted`. Host modules may publish their own semantic event keys.

An omitted trigger makes the Rule callable. Omitted `enabled` means enabled; inputs are required only when `required: true`.

## Values and results

Bindings resolve through `trigger`, `actor`, `vars`, and `meta`. A `$ref` returns a typed value; ordinary strings remain literals.

```yaml
id: A000000000000020
key: echo_message
label: Echo message
input:
  message:
    value: text
    required: true
steps:
  - id: A000000000000021
    compute:
      assign:
        reply:
          $ref: vars.message
result:
  $ref: vars.reply
```

An Action's `as` name captures its output in `vars`. `result` declares the Rule's return value; an optional `output` contract asserts the result shape. Neither is necessary for a simple command.

`meta.now` is the run's initial ISO timestamp; `meta.today` is its UTC calendar date. A record binding may add `fieldId` to resolve a particular stable Field.

## Composition

| Step       | Purpose                                          |
| ---------- | ------------------------------------------------ |
| `action`   | Call a registered Action using `key` and `input` |
| `compute`  | Assign resolved values to variables              |
| `gate`     | Test a predicate and run `pass` or `fail` steps  |
| `invoke`   | Call another Rule by stable `ruleId`             |
| `foreach`  | Process a bound array                            |
| `repeat`   | Run a bounded number of iterations               |
| `parallel` | Run branches with an `all` or `any` join         |
| `delay`    | Pause for a duration                             |
| `wait`     | Await a signal, timeout, or User request         |

Predicates compose with `all`, `any`, and `not`. Leaf predicates use installed Condition keys. Retries, compensation, loop policies, and output contracts add detail where needed.

Nested Rules inherit their current execution Actor. An Action may override it with `runAs`, using a semantic instance binding rather than embedding a concrete Actor ID in the Spec.

## Durable execution and compatibility

Durable runs retain their definition snapshot, continuation, trace, and waits in instance storage. Duration strings use `ms`, `s`, `m`, `h`, or `d`, such as `30m`; numeric durations are seconds.

The Kernel validates the structure and checks installed runtime capabilities before side effects. A portable Rule can be structurally valid while needing an Action or capability that a particular host has not installed.

Builder.run exposes compatibility feedback in the workflow editor and uses the runtime's short/durable launch path. See [workflow-editor.svelte](../src/lib/components/workflow-editor.svelte) and [workflow-launch.ts](../src/lib/app/workflow-launch.ts).

The full language belongs to Framework. Its [Rule docs](https://github.com/jthum/framework/blob/main/docs/rules.md) and source cover the advanced options without duplicating a schema here.
