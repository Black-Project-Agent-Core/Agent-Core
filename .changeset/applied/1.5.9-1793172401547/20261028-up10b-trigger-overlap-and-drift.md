---
"agent-core": patch
---

The Skill pack lint now reports where the Triggers of different packs say the same thing: bullets shared by five or more packs, pairs of packs with near-identical Triggers, and a Non-triggers entry that is another pack's Trigger. It also accepts `--packs <folder>` to lint another folder. A new explicit, read-only script `scripts/research/skill-upstream-drift.mjs` asks the public GitHub compare API, anonymously, whether any file under a pack's pinned upstream path changed since the pinned commit; it reports changed, unchanged or unknown, stops at a rate limit, and writes a file only under `runtime/tmp`. It is not part of any build and never changes a pin.