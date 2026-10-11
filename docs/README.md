# Builder.run documentation

Builder.run turns a portable application Spec into an app people and agents can shape and use.

## Using Builder.run

1. [Getting started](getting-started.md)
2. [Core concepts](concepts.md)
3. [Building an app](building.md)
4. [Fields and input behavior](fields.md)
5. [Automations and workflows](workflows.md)
6. [Record lifecycles](lifecycles.md)
7. [WebMCP and agents](webmcp.md)
8. [Data and persistence](data-and-persistence.md)

## Developing Builder.run

- [Architecture and code map](architecture.md)
- [Canonical automation format](automations-spec.md)
- [Testing](testing.md)

These docs describe Builder.run's product and its integration with [Framework](https://github.com/jthum/framework). Framework owns the portable Spec and runtime contracts; its [docs](https://github.com/jthum/framework/tree/main/docs) and [source](https://github.com/jthum/framework/tree/main/src) are the reference for those APIs.

The visual editors use friendly working models, but exported YAML and JSON contain the same canonical Framework Spec. Instance data such as records, Actors, memberships, and Attachments is separate from that definition.
