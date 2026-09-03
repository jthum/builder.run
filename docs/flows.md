# Rules and flows

The UI calls behavioural definitions **Rules**. In the application spec and runtime, the underlying primitive is a **Flow**.

A Flow is a composable sequence of application operations.

## Callable flows

A callable Flow represents an explicit action.

Examples:

- Mark project complete
- Approve expense
- Archive submission

A callable Flow can be exposed to:

- the human UI;
- agents through WebMCP;
- or both.

The same runtime execution path should be used regardless of who invoked it.

## Triggered flows

A Flow can also run in response to an application event.

This turns the same primitive into an automation.

Typical triggers include record creation, deletion, or changes to a record/field.

For example:

```text
invoice.status changes to paid
        ↓
triggered Flow
        ↓
set invoice.paid_at = now
```

## Steps

Flows are composed from small steps rather than domain-specific workflow code.

The current model includes operations such as:

| Step   | Purpose                          |
| ------ | -------------------------------- |
| Create | create a record                  |
| Set    | change one or more values        |
| Delete | remove a record                  |
| Query  | retrieve records for later steps |
| When   | conditionally run a branch       |
| Invoke | run another Flow                 |

Composition is intentional: larger behaviours should emerge from sequences of simple operations.

## Inputs and references

Callable Flows can accept inputs.

References can point to records already in context, including records passed into the Flow or returned by earlier steps.

This lets a Flow express behaviour such as:

```text
input: project

when project.status != complete
    set project.status = complete
```

without introducing a special "complete project" runtime primitive.

## Why one primitive

builder.run deliberately avoids separate engines for actions, automations, and workflows where one composable primitive can represent them.

The semantics emerge from how a Flow is used:

```text
callable Flow       → action/capability
Flow + trigger      → automation
Flow + state/guards → workflow behaviour
```

This keeps the application spec smaller and more portable.
