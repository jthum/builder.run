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

| Area                                             | Tests                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap and Space/App selection                | [bootstrap.spec.ts](../src/lib/framework/bootstrap.spec.ts)                                                                                                                                                                                               |
| Routed SQLite persistence                        | [sqlite.spec.ts](../src/lib/framework/sqlite.spec.ts)                                                                                                                                                                                                     |
| Record workflows                                 | [record-workflow.spec.ts](../src/lib/framework/record-workflow.spec.ts)                                                                                                                                                                                   |
| User approval flow                               | [approval-example.spec.ts](../src/lib/framework/approval-example.spec.ts)                                                                                                                                                                                 |
| WebMCP tools                                     | [webmcp.spec.ts](../src/lib/app/webmcp.spec.ts)                                                                                                                                                                                                           |
| Assistant MCP projection                         | [assistant-tools.spec.ts](../src/lib/inference/assistant-tools.spec.ts)                                                                                                                                                                                   |
| Conversation and cancellation                    | [assistant.spec.ts](../src/lib/app/assistant.spec.ts)                                                                                                                                                                                                     |
| Inference integration and replay                 | [runtime.spec.ts](../src/lib/inference/runtime.spec.ts)                                                                                                                                                                                                   |
| Encrypted Workspace settings                     | [secrets.spec.ts](../src/lib/framework/secrets.spec.ts)                                                                                                                                                                                                   |
| Templates and example records                    | [app-templates.spec.ts](../src/lib/app/app-templates.spec.ts), [template-records.spec.ts](../src/lib/app/template-records.spec.ts)                                                                                                                        |
| Official block registry                          | [registry.spec.ts](../src/lib/blocks/registry.spec.ts)                                                                                                                                                                                                    |
| Analytics projections and states                 | [analytics.spec.ts](../src/lib/blocks/analytics.spec.ts), [chart-data.spec.ts](../src/lib/runtime/chart-data.spec.ts)                                                                                                                                     |
| Navigation, agenda, gallery and status breakdown | [page-blocks.spec.ts](../src/lib/blocks/page-blocks.spec.ts), [links.spec.ts](../src/lib/blocks/links.spec.ts), [agenda dates](../src/lib/blocks/data/agenda/data.spec.ts), [status grouping](../src/lib/blocks/highlights/status-breakdown/data.spec.ts) |

Analytics tests render the real block components and SVG markup with a fixed-size plot fixture. They cover flat and nested View aliases, aggregate output, independent comparison Views, count mode, zero/null values, loading and empty results, and Library previews without requiring a browser or `ResizeObserver`.

[Chart accessibility markup](../src/lib/components/chart-accessibility.spec.ts) and [interaction](../src/lib/runtime/chart-interaction.spec.ts) tests cover unique pattern references, matching legend states, one tab stop per plot, arrow/Home/End navigation, Escape, pointer/focus precedence and stale-state cleanup. They use server-rendered SVG and deterministic event targets, not browser screenshots. Screen-reader behaviour, forced-colour appearance and pointer hit areas still benefit from manual checks.

## Manual browser checks

Server deployment has deterministic tests in [runtime.spec.ts](../src/lib/server/runtime.spec.ts),
[access.spec.ts](../src/lib/server/access.spec.ts), and
[client-parity.spec.ts](../src/lib/server/client-parity.spec.ts). These cover realm isolation,
live authorization changes, password/session lifecycle, and direct-versus-HTTP editor contracts.
The [setup tests](../src/lib/server/setup.spec.ts) verify explicit owner provisioning, refusal of
repeat/partial setup, hidden password input, confirmation and cancellation, terminal restoration,
and private stdin automation. No credential environment variables are needed for these tests.
The [browser setup contract tests](../src/lib/server/browser-setup.spec.ts) exercise first-run
HTTP onboarding without a browser: ordinary API gates, same-origin checks, invalid input retries,
concurrent claims, immediate sign-in, repeat-setup refusal and persistence across restart.
After `vp run build:server`, run `vp run test:server` for the real HTTP/process restart and
backup/restore proof. See [deployment](deployment.md). It uses only temporary test directories.

Record presentation tests are in [record-details.spec.ts](../src/lib/app/record-details.spec.ts),
[record-preview.spec.ts](../src/lib/app/record-preview.spec.ts) and
[component rendering](../src/lib/components/record-details.spec.ts). They cover plain/modified
clicks, preview ordering and focus return, stale loads, retry, reference-read isolation,
preserved scalar values, record links/selection across list, card, Kanban and calendar Views,
aggregate/missing-identity guards and query-side related-record filters. Framework separately tests the
host-neutral details and non-modal panel. These deterministic checks do not verify actual browser
focus movement or responsive appearance.

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

If WebMCP is available, ask an external agent to inspect, refine, and use an App. If using the built-in Assistant, configure its provider from the Assistant's Model settings first. Check the available-tools list, streamed response, tool activity, Stop and New conversation. Try creating an App, adding a Collection, writing a record and querying a View in one conversation. Provider access is not covered by mocked deterministic tests; check your provider's browser/CORS support manually.

For example:

> Inspect this Space and App. Describe the record types, Views, and workflows without changing anything.

Then:

> Add a priority choice field to Task, preserve the existing model, and set a fictional task to high priority.

Check the resulting definitions and data. Model behavior depends on the provider and context; an agent check complements deterministic validation and authorization tests.

See [WebMCP and agents](webmcp.md) for the current tool contracts.
