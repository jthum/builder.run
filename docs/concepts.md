# Core concepts

builder.run is intentionally based on a small set of composable primitives. The aim is to let more complex application behaviour emerge from combinations of those primitives instead of adding a separate subsystem for every use case.

## The application spec

The **application spec** is the source of truth for an app.

It describes things such as:

- Types and fields
- Views
- Forms
- Pages and widgets
- Rules (Flows)
- exposure to humans and agents

The runtime reads the spec and materialises a working application from it.

Changing the spec is therefore not code generation. It changes the live application model, and the runtime reconciles the UI, storage, and WebMCP capability surface around it.

## Space and App

A **Space** is the root context in which apps and shared data live.

An **App** is a specialised child space with its own application model and local data. The current UI deliberately presents the simpler concepts of Spaces and Apps, even though the underlying model can be recursive.

A useful example is:

```text
Personal Space
├── Organisations   (shared)
├── Contacts        (shared)
└── Conference App
    ├── Sessions    (app-local)
    └── Venues      (app-local)
```

A type exposed by the parent Space can be reused by child apps. This avoids forcing every app into a data silo.

## Types

A **Type** describes a kind of record: Project, Contact, Submission, Session, Expense, and so on.

A type is more than a database declaration. It gives the runtime enough information to derive useful defaults such as:

- a real SQLite table;
- create/read/update/delete operations;
- basic create/edit forms;
- navigation and record screens;
- agent-facing operations when the type is exposed.

This is one of builder.run's core principles: **strong primitives should remove repetitive setup**.

### Fields

The current field vocabulary includes:

| Kind      | Typical use                    |
| --------- | ------------------------------ |
| Text      | names, titles, notes, URLs     |
| Number    | amounts, counts, scores        |
| Date      | deadlines and dates            |
| Boolean   | yes/no state                   |
| Choice    | one value from a fixed set     |
| Reference | a relationship to another type |

Fields can carry constraints and configuration such as required/default values, choice options, and reference targets.

## Views

A **View** is a reusable query/projection over application data.

Views define what records are interesting to a particular part of the app: active projects, submissions awaiting review, upcoming sessions, high-priority work, and so on.

They can select fields, filter records, order results, and traverse declared relationships where the runtime supports it.

Views are intentionally not limited to "reports". They are a general application primitive and can drive many presentation surfaces.

## Forms

Types generate sensible create/edit forms by default.

A **Form** becomes useful when the app needs a deliberate input surface rather than the implicit type form: a different field order, a subset of fields, or behaviour attached to submission.

## Pages and widgets

A **Page** is a user-facing application surface composed from widgets.

Pages are deliberately first-class navigation. They are not merely generated CRUD screens.

The current runtime includes widgets for:

- headings and descriptive content;
- number cards;
- lists and tables;
- bar charts;
- donut charts;
- line charts.

Widgets reuse other primitives instead of inventing their own data model. A table or chart, for example, is backed by a View.

Pages can be organised into folders when an app needs navigation hierarchy.

## Rules (Flows)

A **Flow** is builder.run's behaviour-composition primitive.

A callable flow can become an action a person or agent invokes. A flow with a trigger behaves like an automation.

This means "actions", "abilities", and "automations" can emerge from one primitive rather than requiring independent engines.

See [Rules and flows](flows.md).

## Actors

An **Actor** is an identity that can act.

Humans, agents, and system processes can all be actors. Authentication identities are a separate concern: every authenticated user can act as an actor, but an actor does not necessarily need to be a user.

The current browser runtime starts with one local human administrator. The actor model exists so ownership, permissions, and audit semantics have somewhere coherent to attach as the runtime grows.

## Exposure

Exposure controls which parts of the model are available outside their immediate scope.

Two especially important forms are:

- **Space exposure** — make a parent Space type available to child apps.
- **Agent exposure** — make an application capability available through WebMCP.

Exposure is explicit. An agent does not automatically receive unrestricted access to everything in the runtime.

## Putting the primitives together

A typical app may be only:

```text
Types
  ↓
Views
  ↓
Pages

+ Forms where defaults are not enough
+ Flows where explicit behaviour is needed
```

The result is still captured as one portable spec.

That same spec drives the human UI, the local database materialisation, and the dynamic WebMCP surface.
