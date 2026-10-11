# Testing

Deterministic tests protect Builder.run's Framework integration, templates, queries, authoring tools, and block loading. Manual checks cover the browser experience and optional agent interaction.

## Development checks

From the repository root:

```bash
vp check
vp run check
vp test
vp build
```

`vp check` runs formatting and linting. `vp run check` runs Svelte/TypeScript diagnostics. `vp test` runs the configured deterministic suite; `vp build` verifies the production application and worker assets.

Run focused tests during development, for example:

```bash
vp test src/lib/app/webmcp.spec.ts
vp test src/lib/framework
```

Framework has its own tests and package checks in its repository. Run the relevant Framework checks when modifying shared contracts or implementations; passing Builder.run's suite does not replace adapter or Kernel conformance tests.

## Useful test entry points

| Area                              | Tests                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap and Space/App selection | [bootstrap.spec.ts](../src/lib/framework/bootstrap.spec.ts)                                                                        |
| Routed SQLite persistence         | [sqlite.spec.ts](../src/lib/framework/sqlite.spec.ts)                                                                              |
| Record workflows                  | [record-workflow.spec.ts](../src/lib/framework/record-workflow.spec.ts)                                                            |
| User approval flow                | [approval-example.spec.ts](../src/lib/framework/approval-example.spec.ts)                                                          |
| WebMCP tools                      | [webmcp.spec.ts](../src/lib/app/webmcp.spec.ts)                                                                                    |
| Assistant authoring tools         | [authoring-tools.spec.ts](../src/lib/inference/authoring-tools.spec.ts)                                                            |
| Templates and example records     | [app-templates.spec.ts](../src/lib/app/app-templates.spec.ts), [template-records.spec.ts](../src/lib/app/template-records.spec.ts) |
| Official block registry           | [registry.spec.ts](../src/lib/blocks/registry.spec.ts)                                                                             |

## Manual browser checks

Use a disposable browser profile when exercising deletion or storage cleanup.

1. Open the app and confirm the local runtime starts.
2. Create an App from a template and check its pages, records, and Views.
3. Add a record and reload to verify persistence.
4. Add or rename a field; verify existing values remain accessible.
5. Exercise a relationship query, filter, sort, and aggregate.
6. Submit a record Form and a Custom Form with a related workflow.
7. Run a manual workflow; inspect any persisted run and User request.
8. Browse the block Library and open pages using different block categories.
9. Check **Inspect** for the catalog, Workspace databases, storage backend, and WebMCP status.
10. Export the Spec and verify it describes the App without including records or credentials.

The optional `vp run test:browser` script uses Puppeteer and a local browser. Read [browser-smoke.mjs](../scripts/browser-smoke.mjs) before running it: it creates template data and exercises reload persistence, and its selectors may need updating as the UI evolves.

## Agent checks

If WebMCP is available, ask an external agent to inspect, refine, and use an App. If using the built-in Assistant, configure its provider in profile settings first.

For example:

> Inspect this Space and App. Describe the record types, Views, and workflows without changing anything.

Then:

> Add a priority choice field to Task, preserve the existing model, and set a fictional task to high priority.

Check the resulting definitions and data. Model behavior depends on the provider and context; an agent check complements deterministic validation and authorization tests.

See [WebMCP and agents](webmcp.md) for the current tool contracts.
