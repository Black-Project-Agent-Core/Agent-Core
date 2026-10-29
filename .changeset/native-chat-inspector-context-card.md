---
"agent-core": minor
---

Move the context window bar into the Inspector as a "Context Window (N%)" card (model, used / window, bar with the 70% manual-compact marker) and remove it from above the composer. Iterations (n / max) and Context recall now update live for every turn, including turns started through the bridge: the turn row gets a nullable `max_iterations`, `iterations` is written on each iteration and `retrieval_count` once memory recall completes (final values still come from turn finalization). The iteration limit and its failure behaviour are unchanged.
