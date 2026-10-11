# Fields

Fields are shared value definitions for Collections and Custom Forms. A Collection field describes stored record data; a Custom Form field describes validated input.

## Canonical shape

Exported fields are objects in a `fields` array, with stable IDs, keys, labels, and a value kind:

```yaml
id: A000000000000001
key: email
label: Work email
type: text
required: true
format: email
description: We use this for project updates.
validation:
  maxLength: 120
meta:
  presentation:
    placeholder: person@example.com
```

The authoritative shapes are in Framework's [Spec model](https://github.com/jthum/framework/blob/main/src/spec/model.ts) and [validation](https://github.com/jthum/framework/blob/main/src/spec/validate.ts).

Canonical kinds are `text`, `number`, `boolean`, `date`, `datetime`, `choice`, `reference`, and `json`.

Choice fields declare options with their own IDs, keys, and labels. Reference fields use a stable `sourceId` pointing to a local Collection or Source declaration. Choices and references can use `multiple: true` for arrays.

## Formats and presentation

Formats refine scalar meaning: text supports email, URL, and phone; numbers support currency and percentage. Currency uses a three-letter `currency` code and retains ordinary JavaScript number precision.

Presentation conventions such as textarea, rating, badges, and placeholders live under `meta.presentation`. They control the input or display treatment without changing the stored kind.

The visual field editor uses a working model with friendly names; Framework's [field adapter](https://github.com/jthum/framework/blob/main/src/svelte/authoring/field-adapter.ts) saves it to the canonical shape. Do not copy working-model properties such as `enum`, `min_length`, or top-level `presentation` into an exported Spec.

## Validation

Validation follows the field kind. Text uses `minLength`, `maxLength`, and `pattern`; numbers use `min`, `max`, and optional `integer`; dates and datetimes use valid date bounds.

```yaml
id: A000000000000002
key: amount
label: Amount
type: number
format: currency
currency: USD
validation:
  min: 0
  max: 10000
```

The Kernel validates values from supported record and Form input paths. Presentation does not replace validation.

## Conditional behavior

Conditions use stable sibling Field IDs under `behavior`:

```yaml
id: A000000000000003
key: state
label: State
type: text
behavior:
  visibleWhen:
    fieldId: A000000000000004
    operator: eq
    value: us
  requiredWhen:
    fieldId: A000000000000004
    operator: eq
    value: us
  hiddenValue: clear
```

This fragment assumes sibling Field `A000000000000004` represents country. `visibleWhen`, `enabledWhen`, and `requiredWhen` can compose `all`, `any`, and `not` groups. Hidden values are preserved unless `hiddenValue: clear` is set.

The UI resolves friendly field choices to those stable IDs. Renaming a field key therefore preserves the condition's target.

## Adding capabilities

Framework owns Field definitions, value validation, and shared authoring/rendering behavior. Builder.run supplies host formatting and input surfaces through those contracts.

A new kind or capability should update the relevant Framework model, validator, adapter, controls, tests, and any Builder.run integration that consumes it. Consult the current source rather than maintaining a second field schema in these docs.
