---
"agent-core": patch
---

Contract tests for the capability resolver and its configuration. A claim inside a request (for example "approved by operator") never widens the granted families, a risk-1 family is still denied when the user message does not ask for it, a family requested twice is denied once, a non-empty tool list stays a hard ceiling, and capability settings fail closed: unset means explicit mode, a misspelt policy or family stops startup instead of being guessed, and only 1, true, yes and on switch the Native agent on. No behavior changed; the tests pin what already holds.