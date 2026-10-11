# WebMCP and agents

Builder.run supports external agents through WebMCP and a built-in Assistant through Framework inference. Both can work with the live application definition.

## Browser support

WebMCP requires a browser and agent client that expose the API. Open **Inspect** to check availability and registered tools. A browser without WebMCP can still use the human interface and configured Assistant.

Browser setup varies by client and release. Builder.run checks API availability at runtime rather than requiring a particular browser version.

## Authoring tools

The WebMCP authoring surface can inspect or change the selected Space and App:

- `get_space`, `get_spec`, and `export_spec` inspect context and definitions.
- `create_app`, `switch_app`, `delete_app`, and `create_space` manage selection and topology.
- `list_templates` and `get_blocks` discover bundled building resources.
- `upsert_collection`, `upsert_view`, `upsert_form`, `upsert_rule`, and `upsert_page` save canonical definitions.
- `apply_spec` replaces the complete App Spec.
- `get_automation_primitives` reports installed Action/Condition keys and runtime capabilities.

Inspect the current Spec before editing. Preserve existing definition IDs and unrelated items. Each WebMCP upsert receives a complete canonical definition with its ID. A Collection can be installed in the Space and attached to the App using `shared: true`.

Tool contracts live in [webmcp.ts](../src/lib/app/webmcp.ts); the canonical format lives in Framework's [Spec model](https://github.com/jthum/framework/blob/main/src/spec/model.ts).

## Application tools

The compact record surface uses semantic Collection or Source keys:

```text
describe_collection
list_records
get_record
create_record
update_record
delete_record
transition_record
```

`describe_collection` returns the current schema. Record input values use field keys. Lifecycle transitions are checked against the Collection's current definition.

`query_view` queries a named View with its declared parameters. `submit_form` uses the canonical Form submission path and dispatches related Rules. Enabled manual Rules exposed to agents become `invoke_<rule-key>` tools. A durable invocation returns execution state and a link to the run inspector.

Optional **Typed WebMCP tools** in Space settings add per-Collection aliases with expanded schemas, such as `create_project`. The compact operations remain available. The setting changes tool advertisement, not the portable Spec.

## Registry lifecycle

The tool registry tracks capabilities rather than record contents. Ordinary record changes should not refresh it; Spec or exposure changes can update it. Compact tools discover the current schema when used, while typed aliases also depend on field definitions.

The [WebMCP tests](../src/lib/app/webmcp.spec.ts) cover the projection and its interaction with the Kernel.

## Built-in Assistant

The Assistant uses Framework's inference gateway and YAIR with an OpenAI-compatible provider. Configure its endpoint, model, and API key in profile settings.

Its authoring projection reuses the WebMCP implementation but adds inference-specific input affordances, including generating missing IDs for new definitions. It targets the selected App; its authoring projection excludes Space/App creation, switching, and deletion.

Framework also supplies its own inference tools for record operations and exposed Rules. These are separate tool projections over the same runtime contracts.

See [authoring-tools.ts](../src/lib/inference/authoring-tools.ts), [runtime.ts](../src/lib/inference/runtime.ts), and [assistant.svelte.ts](../src/lib/app/assistant.svelte.ts) for the host wiring.

## Try the complete flow

1. Open Builder.run and inspect WebMCP availability.
2. Ask the external agent to describe the current Space and App without changing it.
3. Ask it to create a client project tracker or refine an existing App.
4. Review the saved definitions and screens.
5. Ask it to add fictional clients, projects, and tasks.
6. Add a field and confirm `describe_collection` reports it.
7. Use the new field through the record tools; check typed aliases too if enabled.

This exercises authoring, schema discovery, and application use together. The built-in Assistant can exercise similar behavior within the selected App.

See [Testing](testing.md) for deterministic checks and a manual smoke checklist.
