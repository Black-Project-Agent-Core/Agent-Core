---
"agent-core": patch
---

Prevent Memory lock heartbeat compromise from terminating Node and harden launcher status refresh against overlapping probes, transient health misses, slow Windows process-state queries, and one-tick passive Execution/Game Mode readiness flaps.