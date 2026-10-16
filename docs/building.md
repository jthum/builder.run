# Building an app

Start with the information you need to track, then add the screens and behavior that make it useful.

## Model the records

For a client project tracker, start with Client, Project, and Task. These are record types in the Data editor and Collections in the canonical Spec.

Name a type in the singular, such as `Project`. Builder.run infers its plural display name; you can override it when your terminology requires it.

```text
Project
├── name
├── client → Client
├── status
├── budget
└── due_date
```

Use reference fields for relationships rather than repeating a client's details on every project. Give fields validation and conditionals where needed; see [Fields](fields.md).

## Choose where data belongs

Keep app-specific records inside the App. Data reused across Apps can live in the Space and be attached to an App as a Source.

```text
Personal Space
├── Clients
├── Project tracker
│   ├── Projects → Client
│   └── Tasks → Project
└── Billing
    └── Invoices → Client
```

An Attachment is the instance connection to shared data. Workspace ancestry alone does not grant access. See [Core concepts](concepts.md).

## Create useful Views

A View answers a recurring question:

- Which projects are active?
- Which tasks are overdue?
- What is the total budget by client?
- Which projects need attention?

Views can filter, sort, select fields, traverse declared references, and aggregate data. Page blocks use the query result; a View may also declare a preferred presentation.

## Compose Pages

Keep the page focused on what someone needs to understand or do.

```text
Project overview

[ Active projects ] [ Open tasks ] [ Total budget ]

[ Chart: budget by client ]

[ List: work needing attention ]
```

The official library includes Highlights, Content, Data, Charts, and Actions. Browse previews at `/library/blocks`.

Useful building blocks for an app home page:

- **Navigation card** — one titled destination with optional supporting text. Use layout groups to arrange several cards. Destinations accept app paths or HTTP(S) addresses; link to a Page containing a Form when appropriate.
- **Status breakdown** — a segmented distribution with values and percentages. Leave Value field blank to count View rows; select a count/sum measure when using a grouped View. Negative or invalid weights do not contribute.
- **Agenda** — dated items grouped into Overdue, Today and Upcoming. Choose a View already filtered to unfinished or relevant work. Calendar dates retain their day; datetime values use the viewer's timezone and show the time. Invalid dates are omitted, and earliest items appear first.
- **Image gallery** — images from a View field, with captions, optional supporting text and record links. Accepts HTTP(S) or app-relative image URLs, loads images lazily and shows a placeholder for missing or failed images. The Library example uses external sample photos; no upload service is implied.

Data-backed blocks present the rows returned by their selected View. For full-dataset summaries, use a grouped/aggregate View rather than a limited record list. Record links require a selected record identity; aggregate rows do not become record links.

### Chart interaction

Charts use lightweight SVG renderers with patterned fills, matching legend swatches and dashed line styles so colour is not the only distinction. Hovering or focusing a mark highlights its category/series and its legend; unrelated series dim. The value readout stays outside the plot so it does not obscure data.

Tab enters a plot at one mark. Arrow keys explore values, Home/End reach its endpoints, and Escape clears the highlight. Legend buttons toggle visibility and announce their state. Hiding every item leaves the legend available to restore them. **View chart data** opens a labelled table of all chart values, including hidden items; the table is rendered only when opened.

Pattern IDs are scoped to each chart, and colour/pattern assignments remain stable when legend items are hidden. Effects respect reduced-motion and forced-colour preferences. Donut and funnel charts require nonnegative values; bar and diverging stacked charts support signed values.

The shared implementation lives in [ChartFrame](../src/lib/components/chart-frame.svelte), [ChartPattern](../src/lib/components/chart-pattern.svelte) and [ChartInteraction](../src/lib/runtime/chart-interaction.svelte.ts). Rendering and interaction tests are listed in [Testing](testing.md); automated markup checks do not replace browser or assistive-technology verification.

Pages can be grouped in navigation. Page URLs use `/p/<page-key>`; navigation hierarchy does not imply nested page routes.

## Add Forms and Automations

Record types provide basic create/edit forms. Add a Form when you want a particular field order, subset, or input experience.

A **Custom Form** owns its fields and collects information without automatically creating a record. Related workflows listen for `form.submitted` and decide what happens next.

Automations can be manual actions or event-triggered workflows. For example, a workflow can update a project's status, create follow-up records, or request a user's response. Configure a lifecycle when the type needs a restricted set of state transitions.

See [Automations and workflows](workflows.md) and [Record lifecycles](lifecycles.md).

## Check and export

Use the app through its human interface. If you use an agent, check that it can inspect the model and use the resulting tools. Preserve stable IDs when refining existing definitions.

Export the Spec once the model is useful. It captures the definition; records and shared-data connections are separate instance concerns.

## Extending the block library

Each official block lives under `src/lib/blocks`, with:

- `definition.ts` — stable key, category, configuration inputs, and editor copy.
- `block.svelte` — its Svelte implementation.
- `preview.ts` — example configuration and mock context (date-sensitive examples may be relative to today).

The [registry](../src/lib/blocks/registry.ts) discovers nested folders recursively. Definitions load for discovery; components and previews load on demand. A block can import specialized dependencies, with shared dependencies deduplicated by the module graph.

Read projected View values through [viewCellValue](../src/lib/app/view-results.ts), not direct row property access: a selected field may have a custom flat alias or nested output path. Keep data transforms beside their block and test both aliases and loading/empty states.

Builder.run owns the official block catalog and templates. Framework provides the shared catalog and block contracts. Installed catalogs are declared by the host; entering an arbitrary remote URL does not install executable code.
