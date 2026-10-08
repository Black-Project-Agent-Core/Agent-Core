# Agent Core release intents

This directory stores pending release intent using the Changesets Markdown format.

A release-relevant change should create one Markdown file with exactly one Agent Core bump:

```md
---
"agent-core": patch
---

Concise description of the shipped change.
```

Allowed bumps for Agent Core release tooling are `patch`, `minor`, and `major`.

Release intent is metadata only. It never authorizes, blocks, routes, retries, deploys, publishes, tags, pushes, or restarts Agent Core.

Consumed intents are archived under `.changeset/applied/` by explicit `npm run release:apply`. Files in that archive are not pending intents.

`package.json` is the current product-version authority (`0.14.0` at the 2026-10-08 source review). Pending intents can describe implementation already present in source but not yet included in a new applied release. Historical lineage wording in archived intents is not a current remote policy; see [AGENTS.md](../AGENTS.md). No intent files were consumed by the documentation refresh.
