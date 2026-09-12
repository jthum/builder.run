# Data and persistence

builder.run's current runtime stores application data locally in the browser.

The application spec remains the canonical description of the software, while SQLite is the materialised runtime storage.

## SQLite in the browser

Application data is stored with **wa-sqlite** running in a Web Worker.

The runtime chooses the best available persistence backend:

1. **OPFS** — preferred when available.
2. **IndexedDB** — fallback persistent storage.
3. **Memory** — emergency fallback; data does not survive the browser session.

The **Inspect** screen reports the active backend and the databases currently in use.

All SQLite-specific code, including catalog SQL, is contained in the browser runtime's SQLite persistence adapter. Runtime services depend on logical `RecordStore`, `SchemaMaterializer`, and `CatalogRepository` contracts rather than SQL connections.

## Catalogue and application databases

The runtime maintains a small catalogue for information such as:

- Spaces;
- actors;
- the active Space.

Each Space/App materialises its own application data in SQLite.

Types become real tables and readable field keys become real columns. The spec, rather than the physical schema, remains authoritative.

The browser Host does not issue SQL or DDL itself. It talks to logical persistence contracts, with SQLite supplied by the current `SqlitePersistence` adapter. This keeps record behaviour and the portable query model independent from the physical database without pretending that unlike databases share every capability.

The current split is:

- record CRUD and direct filtering/sorting/limits through `RecordStore`;
- portable view execution through `PortableQueryExecutor`;
- physical type reconciliation through `SchemaMaterializer`;
- runtime workspace state through `CatalogRepository`.

A future operational adapter can implement those contracts natively. An analytical engine such as DuckDB may instead sit alongside the operational store when that better matches its workload; storage interchangeability is not a requirement that every engine serve the same role.

## Schema reconciliation

When the application spec changes, builder.run reconciles the materialised SQLite schema.

Reconciliation validates every affected store before changing any of them. Additions and stable-ID renames are applied before the catalog accepts the new spec; destructive pruning happens only after that commit. An interrupted cleanup can therefore leave an unused table or column to prune later, but it cannot make the accepted logical spec unusable.

Typical changes include:

- adding a Type → create a table;
- adding a field → add a column;
- renaming a field → reconcile the existing column;
- removing a field or Type → remove the corresponding materialisation.

The goal is to let the application model evolve without asking the user to perform manual database migrations.

## Shared Space data

Apps do not have to duplicate records that belong at the parent Space level.

A parent Space can expose Types such as Organisation or Contact. Child apps can then reference those records while keeping app-specific Types in their own scope.

Conceptually:

```text
Personal Space
│
├── Organisation
├── Contact
│
├── CRM App
│   └── Opportunity → Organisation
│
└── Projects App
    └── Project → Organisation
```

The reference is part of the application model; the portable spec does not depend on a particular SQLite cross-database mechanism.

## Export and import

builder.run can export the application spec as YAML or JSON.

The export captures the **definition** of the app: its model, presentation, and behaviour.

It is not currently a full backup of the records stored in the local SQLite databases.

That distinction matters:

```text
Spec
  → portable application definition

SQLite data
  → local runtime records
```

A future runtime can consume the same spec while choosing a different persistence model.

## Browser-local scope

Because the current runtime is local-first, records belong to the browser context in which they were created.

If an agent builds an app inside one browser profile, another browser profile will not automatically see that local SQLite data.

The portable spec is the current bridge between runtimes. Cross-device/shared persistence is a separate deployment concern rather than something encoded into the application definition.

## Privacy

There is no required application-data backend in this runtime. Records remain in the browser unless the user deliberately moves or exposes them through another mechanism.

As with any browser application, agents that are granted WebMCP access can act on the data and capabilities explicitly exposed to them.
