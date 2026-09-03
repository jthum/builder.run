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

## Catalogue and application databases

The runtime maintains a small catalogue for information such as:

- Spaces;
- actors;
- the active Space.

Each Space/App materialises its own application data in SQLite.

Types become real tables and readable field keys become real columns. The spec, rather than the physical schema, remains authoritative.

## Schema reconciliation

When the application spec changes, builder.run reconciles the materialised SQLite schema.

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
