# Record lifecycles

A record type can attach a lifecycle to one single-choice Field. The choices define all states; the lifecycle selects the initial state, terminal states, and allowed transitions.

Configure it under **Data → Advanced → Lifecycle** when the type needs a controlled journey.

## Canonical definition

This is a Collection fragment from an App Spec:

```yaml
id: A000000000000030
key: invoice
label: Invoice
fields:
  - id: A000000000000031
    key: status
    label: Status
    type: choice
    required: true
    options:
      - { id: A000000000000032, key: draft, label: Draft }
      - { id: A000000000000033, key: sent, label: Sent }
      - { id: A000000000000034, key: paid, label: Paid }
      - { id: A000000000000035, key: void, label: Void }
lifecycle:
  fieldId: A000000000000031
  initial: draft
  terminal: [paid, void]
  transitions:
    - id: A000000000000036
      key: send
      label: Send
      from: [draft]
      to: sent
    - id: A000000000000037
      key: mark_paid
      label: Mark paid
      from: [sent]
      to: paid
    - id: A000000000000038
      key: void
      label: Void
      from: [draft, sent]
      to: void
```

The lifecycle points to the stable Field ID, while state values use choice keys. `from` is an array so a transition can start in more than one state.

## Enforcement

New records begin in `initial`. Callers can omit the state or supply that initial value; a different starting state is rejected.

Updates must follow an allowed transition. Terminal states cannot have outgoing transitions, and transitions must be unambiguous. Directly patching the status does not bypass enforcement.

Stable Field IDs preserve the lifecycle association across key renames. Removing the state Field requires removing or changing the lifecycle too.

Builder.run's record screen and WebMCP transition tools expose the currently allowed named moves. Framework validates the resulting record update.

## Workflows around state changes

A workflow can react to `record.field_changed`, narrowed by the Collection's `sourceId` and lifecycle `fieldId`, when a mutation Action publishes that change. Direct lower-level record updates do not automatically publish workflow events.

The lifecycle controls legality; workflows add consequences such as assigning follow-up work or collecting input. Schema reconciliation handles changes to the definition itself.

The reference contracts are Framework's [Spec model](https://github.com/jthum/framework/blob/main/src/spec/model.ts), [validator](https://github.com/jthum/framework/blob/main/src/spec/validate.ts), and [record value validation](https://github.com/jthum/framework/blob/main/src/kernel/record-values.ts).
