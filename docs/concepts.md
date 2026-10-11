# Core concepts

Builder.run uses a small set of composable definitions. Simple apps can start with a few fields; more complex apps add relationships, screens, and workflows.

## Spec

The application **Spec** defines Collections, Sources, Views, Forms, Pages, and Rules. It contains structure and behavior, while records and operational state belong to the runtime.

Builder.run exports Framework's canonical Spec as YAML or JSON. Definitions have a stable `id`, editable semantic `key`, and human-readable `label`. References between definitions use stable IDs where required. Optional `meta` holds JSON-compatible host information.

The [Framework Spec model](https://github.com/jthum/framework/blob/main/src/spec/model.ts) is the contract; the visual editors adapt it to friendly working models.

## Space and App

A **Space** is Builder.run's root Workspace. An **App** is a child Workspace with its own Spec and records.

Framework Workspaces are authority boundaries. Membership, Workspace permissions, and Attachments determine access; parent/root grouping describes topology.

```text
Personal Space
├── Clients             shared Collection
├── Project tracker     App
│   ├── Client Source   attached to shared Clients
│   └── Projects        local Collection
└── Billing             App
    └── Invoices        local Collection
```

A Source declaration is portable. The Attachment that connects it to another Workspace's Collection is instance data.

## Data and fields

A **record type** in Builder.run is a Framework **Collection**. It defines fields, a title field, and an optional lifecycle. The runtime derives storage and basic record screens and forms from it.

| Canonical kind | Typical use                         |
| -------------- | ----------------------------------- |
| `text`         | Names, notes, email addresses, URLs |
| `number`       | Amounts, counts, percentages        |
| `boolean`      | Yes/no values                       |
| `date`         | Calendar dates                      |
| `datetime`     | Instants with a timezone            |
| `choice`       | One or more declared options        |
| `reference`    | One or more related records         |
| `json`         | Structured values                   |

The field editor presents Choices using friendly option controls; its internal working model may call them enum fields. Exported Specs use `choice` and option definitions. See [Fields](fields.md).

## Views

A **View** is a saved query over a local Collection or attached Source. It can filter, sort, project selected fields, aggregate, and accept declared parameters. Reference paths allow related data to participate in queries.

Views support record lists and reporting. Pages can use the same View in different blocks.

## Forms

Create and edit Forms write a local Collection. A Custom Form uses Framework's `standalone` mode and owns its fields.

All use the same validation and conditional field behavior. Custom Form answers are transient unless a workflow stores them. Successful submissions publish `form.submitted`; workflows can select a particular Form using its stable `formId`.

Success text under `submit.success` controls presentation, while the related Rules control business behavior.

## Pages and blocks

A **Page** composes visual **blocks** and layout groups. Blocks can show content or use Views, Forms, and Rules.

The official categories are Highlights, Content, Data, Charts, and Actions. Block definitions are available to editors and agents immediately; each implementation and preview loads on demand. The [Library](building.md#extending-the-block-library) shows mock examples.

## Automations

Builder.run presents Framework Rules as workflows in **Automations**.

A workflow may run manually or react to an event. Its ordered steps can call Actions, compute values, branch, invoke another Rule, loop, run parallel work, or wait. A workflow can be exposed to the human UI or agents and may return a result.

A **lifecycle** belongs to the Collection and determines which state changes are legal. Workflows add behavior around those changes. See [Automations](workflows.md) and [Lifecycles](lifecycles.md).

## Actors and agents

An **Actor** is an identity that can act: a user, Agent, or System. Actors are issued in a Workspace; memberships determine where they can participate.

Builder.run starts with a local user and uses Framework's authorization model. Local Actor selection is host behavior, not server authentication.

The built-in Assistant runs inference on behalf of the selected user's execution context. External agents can use WebMCP when the browser supports it. Neither requires a separate application data model.

## Definition and instance data

Exporting an App carries its Spec. Records, Workspace topology, Actors, memberships, Attachments, settings, credentials, and execution history remain instance state. Moving a Spec to another host may require installing compatible blocks and Actions and binding its shared Sources.

See [Data and persistence](data-and-persistence.md).
