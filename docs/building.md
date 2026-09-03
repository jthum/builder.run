# Building an app

builder.run is designed so that a useful app can emerge from a small number of decisions.

## 1. Model the things you need to track

Start with nouns.

For a conference app, for example:

- Person
- Organisation
- Session
- Venue

For a judging workspace:

- Submission
- Review
- Track

These become **Types**.

Then decide what each record needs to know. Those become fields.

Example:

```text
Submission
├── name
├── project_url
├── repository_url
├── status
└── track → Track
```

Use **Reference** fields when one record relates to another.

## 2. Decide what belongs to the Space

Not every type has to be app-local.

Data that naturally belongs to the person rather than one app can live in the parent Space and be exposed to apps.

For example:

```text
Personal Space
├── People
├── Organisations
└── Event Manager
    ├── Sessions
    └── Venues
```

This lets multiple apps reuse one canonical set of organisations or contacts.

## 3. Add Views

Create Views for questions the user asks repeatedly:

- Upcoming sessions
- Reviews still required
- Active projects
- High-priority work
- Top-rated submissions

Keep the View semantic. It should describe _which data matters_; the Page decides whether that data appears as a table, list, number, or chart.

## 4. Compose Pages

Pages are the application's primary user-facing surfaces.

A simple dashboard often needs only:

1. a heading/description;
2. a few number cards;
3. one chart;
4. a table or list for the work that needs attention.

For example:

```text
Judging Dashboard

[ Total submissions ] [ Reviewed ] [ Average score ]

[ Bar chart: average score by submission ]

[ Table: review queue ]
```

The current chart widgets are **bar**, **donut**, and **line**. Use them where the underlying data naturally supports the visualisation rather than adding charts only for decoration.

Pages may also be organised into folders when the app needs explicit navigation hierarchy.

## 5. Add Forms only where defaults are insufficient

Every Type already has useful create/edit behaviour.

Add or customise Forms when the default generated form is not the right product experience.

## 6. Add Rules when the app needs behaviour

Use Rules (Flows) for meaningful actions or automation.

Examples:

- Mark a project complete.
- Approve an expense.
- Move an item into a new state.
- Stamp a timestamp when a status changes.

Avoid turning ordinary CRUD into bespoke flows. Types already provide that capability.

See [Rules and flows](flows.md).

## 7. Test both human and agent surfaces

Use the app yourself first.

If WebMCP is available, then test the same app through an agent:

- Can it inspect the Space and app?
- Can it create or update the application model through builder tools?
- Do the generated application tools reflect the resulting spec?
- Can it use those tools to create and work with real records?

A useful invariant is:

> **Record changes should not change the WebMCP registry. Capability/spec changes may change it.**

## 8. Export the spec

When the app model is useful, export it as YAML or JSON.

The export is intentionally the application **definition**, not a database dump. The spec should remain understandable and portable independently of this browser runtime.
