---
"agent-core": patch
---

The Learning status poll no longer waits on Grafel. The code-pattern sink answers `/health` from its last observed result and refreshes in the background through the cached, single-flight Code Intelligence health, instead of forcing a full Grafel health collection on every poll; it reports that health has not been observed yet before the first result. The write path keeps its forced check.
