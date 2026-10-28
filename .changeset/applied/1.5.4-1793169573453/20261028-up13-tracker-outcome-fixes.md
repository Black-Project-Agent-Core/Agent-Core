---
"agent-core": patch
---

Three Activity Tracker defects. A Skill outcome could never be recorded because its feature id (`skill:<name>`) did not match the tracker's id rule and recording threw; it is now `skill.<name>`. `recordOutcome` no longer throws into its caller: an outcome that fails validation is kept as a plain `feature-outcome-rejected` event whose context says why. Outcome properties are validated before the cap of sixteen is applied, so invalid keys listed first no longer push valid ones out. A journal that cannot be read now sets the tracker's journal issue instead of reading as an empty journal.
