---
"agent-core": patch
---

The external-controller Learning state file `runtime/learning/external-controller.json` is now written as one compact JSON line instead of two-space indentation, about 30% fewer bytes per save on the measured state. Its content is unchanged after `JSON.parse`, an older indented file is still read and is rewritten compactly on the next save, and the `.last-good` generation and degraded-read refusal behave as before. Episode archive files, recovery snapshots, the shared Learning `state.json` and Native runtime state keep their indented format.
