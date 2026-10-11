# Getting started

Builder.run stores app definitions and records in the browser. You can start building without an account, backend, or AI provider.

## Run the project

This checkout links Framework packages from a sibling `framework` directory. Clone [jthum/framework](https://github.com/jthum/framework) there, then run from the Builder.run repository:

```bash
vp install
vp dev
```

Open the URL printed by the development server. See [Testing](testing.md) for development checks.

## Create an app

Use the app switcher to open the starter library. Choose a template or start blank; rename the app later in App settings.

1. Open **Edit App → Data** and define the record types you need.
2. Add fields and relationships.
3. Create **Views** for useful queries.
4. Compose **Pages** from blocks backed by those views.
5. Add **Forms** for specific input experiences.
6. Add **Automations** for manual actions or reactions to events.

A record type already provides storage and basic create/edit forms. The app updates as you save its definitions; you do not need a code-generation step.

## Build with the Assistant

Open **Assistant** in the sidebar, then use **Model settings** to configure an OpenAI-compatible API endpoint, model, and API key. The key is optional for local providers that do not require authentication. The same connection is available in **Profile settings → Assistant**.

Try:

> Help me build a client project tracker. Track projects and tasks, relate projects to clients, and create a dashboard showing active work and outstanding tasks.

The Assistant can build Apps and use their data, Views, Forms and exposed Automations. Its available-tools list matches WebMCP, without requiring a WebMCP-enabled browser. Tools are discovered as needed and run under your User's permissions; tool activity and errors are shown in the conversation.

App creation and switching move the conversation to the selected App. Switching manually clears the conversation; creating an independent Space changes User identity and stops the current turn. Use **New conversation** to clear history or **Stop** to cancel inference. Cancellation does not undo changes already made.

Review changes in the regular editors. Provider requests leave the browser and can include Specs, records and conversation history. Connection settings are browser-local; the personal API key is not encrypted or included in exported Specs. Providers must allow browser requests (CORS).

## Use an external agent

If your browser and agent client support WebMCP, the agent can discover Builder.run's authoring and application tools. **Inspect** reports WebMCP availability and registered tools.

Without WebMCP, the human interface and configured built-in Assistant remain available. See [WebMCP and agents](webmcp.md).

## Export or edit the definition

Open **Edit App → Export** to copy or download the Spec as YAML or JSON. The same screen can validate and apply an edited definition.

Preserve existing definition IDs when changing keys or labels. Shared Source declarations need compatible instance Attachments in the destination; the export does not include shared records, Actors, credentials, or local operational state.

See [Data and persistence](data-and-persistence.md).
