---
"agent-core": patch
---

Put the user's standing working rules (test attempt limit, no duplication, no benchmarks, commit own changes locally, update changelog, ask before refusing) near the top of the Native system prompt, so the user no longer has to repeat them. Project rules, safety rules and the current user message still outrank it, and simple conversational turns are unaffected.
