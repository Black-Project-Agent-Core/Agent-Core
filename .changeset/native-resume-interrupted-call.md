---
"agent-core": patch
---

Native Continue no longer refuses a turn whose last mutating tool call was cut off by a restart or Stop. The call is answered to the model as interrupted (effect unknown, not run again, check the state first) and the turn goes on, instead of staying stuck until Stop recovery. Automatic recovery still never retries such a turn by itself.
