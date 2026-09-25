# Agent Core release intents

This directory stores pending release intent using the Changesets Markdown format.

A release-relevant change should create one Markdown file with exactly one Agent Core bump:

```md
---
"agent-core": patch
---

Concise description of the shipped change.
```

Allowed bumps for Agent Core first-wave release tooling are `patch`, `minor`, and `major`.

Release intent is metadata only. It never authorizes, blocks, routes, retries, deploys, publishes, tags, pushes, or restarts Agent Core.

Consumed intents are archived under `.changeset/applied/` by explicit `npm run release:apply`. Files in that archive are not pending intents.
