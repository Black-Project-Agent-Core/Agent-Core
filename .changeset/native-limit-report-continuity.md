---
"agent-core": patch
---

Persist a bounded iteration-limit report with the failed Native turn so replay and later conversation turns retain the findings. Emit one failure event, retain cancellation and execution-claim checks, and distinguish external-controller messages from trusted local operator decisions without treating a report as verified task completion.
