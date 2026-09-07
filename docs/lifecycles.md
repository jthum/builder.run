# Record lifecycles

A type may attach a lifecycle to one enum field. The enum choices are the complete set of states;
the lifecycle identifies the initial and terminal states and the named transitions allowed between
them.

```yaml
types:
  submission:
    fields:
      stage:
        type: enum
        required: true
        values: [draft, submitted, shortlisted, rejected]
    lifecycle:
      field: stage
      initial: draft
      terminal: [shortlisted, rejected]
      transitions:
        - key: submit
          from: [draft]
          to: submitted
        - key: shortlist
          from: [submitted]
          to: shortlisted
        - key: reject
          from: [submitted]
          to: rejected
```

`from` is always an array, even for one source state. This keeps one canonical shape while allowing
a transition such as `cancel` to be available from several non-terminal states.

## Runtime contract

- New records always begin in `initial`; callers do not supply the lifecycle field.
- State changes must match one configured transition.
- Terminal states cannot have outgoing transitions.
- Transition keys and each source/target pair must be unambiguous.
- Renaming the lifecycle field updates the lifecycle. Removing it is rejected until the lifecycle is
  removed.

Record pages show the transitions available from the current state. WebMCP exposes the same action
as `transition_<type>`, alongside ordinary CRUD tools. Direct updates to the state field are also
validated, so no client can bypass the lifecycle merely by avoiding the named action.

## Automations around transitions

A successful named transition emits `<type>.<transition>.transitioned`. For example, an automation
can use `submission.shortlist.transitioned` and receive the record plus this payload:

```yaml
transition:
  key: shortlist
  field: stage
  from: submitted
  to: shortlisted
```

The type lifecycle decides whether the transition is legal. Automations add consequences such as
notifications, audit entries, assignments, or integrations. Keeping those responsibilities separate
makes the state model inspectable even when no automation runtime is present.

Schema migrations remain a separate concern because they change the information model itself rather
than moving one record through it.
