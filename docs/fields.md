# Fields

Fields are the shared value-definition primitive used by Types and standalone Forms. On a Type they also define stored columns; on a standalone Form they define validated submission inputs without implying storage. A basic field stays deliberately small:

```yaml
email:
  type: text
  required: true
```

Optional capabilities are added only when the field needs them:

```yaml
email:
  type: text
  label: Work email
  format: email
  placeholder: person@example.com
  description: We use this for approval updates.
  validation:
    max_length: 120
```

## Kinds, formats, and presentation

`type` defines the stored value. The current kinds are `text`, `number`, `date`, `datetime`, `boolean`, `enum`, and `reference`.

`format` gives a scalar value additional meaning without changing its storage kind. Text supports `email`, `url`, and `phone`. Numbers support `currency` and `percentage`; currency fields also declare a three-letter `currency` code.

`presentation` selects a deliberate control or display treatment. Text can use `textarea`, numbers can use `rating`, and enum values can use semantic `badge` presentation.

This separation keeps storage stable when an input or display treatment changes.

## Validation

Validation belongs to the field so every input path applies the same rule, including forms, imports, and agent calls.

```yaml
amount:
  type: number
  validation:
    min: 0
    max: 10000

reference_code:
  type: text
  validation:
    min_length: 6
    max_length: 20
    pattern: "^[A-Z0-9-]+$"
    message: Use 6–20 uppercase letters, numbers, or hyphens.
```

## Conditional behavior

Fields can react to sibling answers with `visible_when`, `enabled_when`, and `required_when`. Hidden answers are preserved by default. Set `hidden_value: clear` when a hidden answer must be discarded.

```yaml
state:
  type: text
  visible_when:
    field: country
    op: eq
    value: us
  required_when:
    field: country
    op: eq
    value: us
  hidden_value: clear
```

Conditions can be grouped with `all`, `any`, and `not` when the simple leaf form is not enough:

```yaml
visible_when:
  all:
    - field: customer_kind
      op: eq
      value: business
    - any:
        - field: country
          op: eq
          value: us
        - field: annual_spend
          op: gte
          value: 10000
```

The visual field editor optimises for the common single-condition case. Grouped conditions remain part of the same canonical model and can be authored in the application spec.

## Capability catalogue

Field compatibility is defined once in `field-capabilities.ts`. Each kind declares its default input widget, supported formats, supported presentations, validation rules, and any additional configuration it requires. The Type editor, form renderer, model validation, and agent-facing schemas consume this catalogue rather than maintaining separate lists.

Adding a capability therefore has an explicit path:

1. Add the kind, format, or presentation to the catalogue.
2. Add its renderer or formatter when it introduces new behavior.
3. Add its value validation when it introduces new constraints.
4. Add catalogue and behavior tests.

The runtime rejects incompatible combinations instead of silently dropping them. For example, a date field cannot use currency formatting and a text field cannot use rating presentation.

There is one canonical field shape. Authored field objects use `type`; the `upsert_field` tool uses `kind` because its `type` parameter identifies the containing record type. No legacy aliases or migration fallbacks are accepted. The compact scalar form (`title: text`) is an intentional canonical shorthand for a field with no optional configuration.
