# Data and persistence

Builder.run's current deployment stores definitions and records in the browser. Framework's Spec describes the app; SQLite materializes its instance data.

## Browser SQLite

Framework's optional browser SQLite package runs `wa-sqlite` in a worker. Storage prefers OPFS, falls back to IndexedDB, and uses memory if persistent storage is unavailable. Memory storage does not survive closing the session.

**Inspect** reports the selected backend and databases. Storage belongs to the browser profile and origin; another profile or device does not automatically share it.

## Catalog and routed databases

Builder.run opens `catalog.db` for Workspace and Actor state, memberships, Attachments, Specs, settings, and workflow execution metadata.

Workspace secret settings are encrypted by Framework using the host's `SecretCipher`; ordinary settings APIs return masked summaries. Builder.run keeps the encryption key in this browser's local storage. This does not protect against scripts with origin access, and losing that key requires re-entering secrets. The personal Assistant's profile settings remain separate, browser-local host state.

Record tables are routed into separate Workspace databases for Spaces and Apps, with scope databases opened as needed. The host chooses filenames in [sqlite.ts](../src/lib/framework/sqlite.ts); Framework owns schema and record semantics.

Physical table and column names derive from stable definition IDs. Human-readable keys and labels remain in the Spec and APIs. Renaming a field does not require changing its physical column name.

## Field storage

Framework's SQLite adapter converts logical values at its persistence boundary:

| Logical field                         | SQLite representation           |
| ------------------------------------- | ------------------------------- |
| Text, single choice, single reference | `TEXT`                          |
| Number                                | `REAL`                          |
| Number with `validation.integer`      | `INTEGER`                       |
| Boolean                               | `INTEGER`, 0 or 1               |
| Date                                  | `TEXT`, `YYYY-MM-DD`            |
| Datetime                              | `TEXT`, normalized UTC ISO-8601 |
| JSON, multiple choices/references     | JSON `TEXT`                     |
| Null                                  | SQL `NULL`                      |

Currency is a display format on a JavaScript number, not an exact-decimal type. It retains floating-point semantics. The adapter also preserves the distinction between omitted and explicitly null fields.

Mappings live in Framework's [field-storage.ts](https://github.com/jthum/framework/blob/main/src/sqlite/field-storage.ts). Filtering, sorting, and aggregation use SQL; scalar fields do not need JSON extraction. Supported relation queries can cross routed SQLite databases. Indexing remains an adapter decision, with no default index on every scalar field.

## Schema changes

Saving a Spec validates its structure, references, and compatibility with existing records before applying it.

Stable Field IDs let the runtime preserve values through key renames. Adding or removing definitions changes the materialized schema; destructive edits can remove records or values. Multi-database lifecycle changes use Framework's recovery mechanism. A pending recovery requires reopening persistence before further storage lifecycle work.

Use the editors for ordinary changes. Direct Spec edits should preserve IDs for definitions that still represent the same thing.

## Shared data

A Space Collection can be used by several Apps through Source declarations and Attachments.

```text
Personal Space
├── Clients
├── Project tracker → Client Source
└── Billing         → Client Source
```

The portable Source declaration names the dependency. The Attachment supplies the instance connection, permissions, and optional restriction. Workspace ancestry alone does not authorize access.

## Export and import

**Export** copies or downloads the current App Spec as YAML or JSON. Applying an edited Spec uses Framework validation and the same runtime persistence boundary.

Export includes the App's Collections, Source declarations, Views, Forms, Pages, and Rules. It excludes:

- Records and shared Collection data.
- Concrete Attachments and Workspace topology.
- Actors and memberships.
- Settings, credentials, and workflow execution history.

A destination must supply compatible shared Source bindings and host capabilities. A Spec export is an application definition, not a complete database backup.

## External communication

A backend is not required for local app storage. An AI provider receives inference requests, and agents can read or change data through tools available to them. Browser-local storage does not mean every configured integration is offline.

See [WebMCP and agents](webmcp.md) for the agent surfaces and [Architecture](architecture.md) for the host boundaries.
