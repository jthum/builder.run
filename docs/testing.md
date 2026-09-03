# Judge / reviewer test guide

This page is a short path for evaluating the WebMCP integration.

## Browser setup

Use either:

- ChatGPT's in-app browser; or
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

Open the deployed builder.run URL supplied with the submission.

No account or backend setup should be required for the local browser runtime.

## Confirm WebMCP is available

Open **Inspect** in builder.run.

The page shows browser/storage diagnostics and the WebMCP tools registered from the live application state.

If WebMCP is not available, the normal human UI will still work, but agent tools cannot be discovered.

## Test 1 — inspect the current application

Ask the agent:

> Inspect this builder.run Space and tell me what app, Types, and capabilities are currently available. Do not modify anything.

This checks discovery and read-only builder tools.

## Test 2 — let the agent mould an app

A good prompt is:

> Build me a small judging workspace for a software hackathon. Track submissions and reviews, score reviews across several criteria, and create useful pages and views for judging and ranking submissions.

The exact result may vary: the point is that the agent is operating **builder tools** that change the application spec.

Watch the human UI update as the spec is materialised.

## Test 3 — use the dynamically generated app tools

After the app exists, ask the agent to populate it:

> Add a few fictional submissions and reviews so I can see the judging workspace in use.

The agent should now be operating tools derived from the app it just created rather than only builder.run's fixed tools.

This is the core test:

> **The agent uses capabilities that were generated from the application model it created.**

## Test 4 — change the capability surface

Ask for a small schema evolution, for example:

> Add a Demo Quality score to reviews, then set it on the two strongest submissions.

The expected sequence is:

1. the agent changes the app spec;
2. the human UI understands the new field;
3. the generated WebMCP schema changes;
4. the agent can use the new field immediately.

## What to look for

The distinctive behaviour is not simply that WebMCP can call CRUD tools.

Look for the full loop:

```text
builder tools
    ↓
application spec changes
    ↓
working human UI changes
    ↓
new/changed WebMCP app tools
    ↓
agent uses the resulting app
```

That is the main capability builder.run is exploring.
