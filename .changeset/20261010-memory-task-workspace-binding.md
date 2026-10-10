---
"agent-core": minor
---

Bind external Memory v2 tasks to verified credential ownership and registered workspace identity, preserving explicit Learning task IDs across transport reconnects and restarts. Resolve scope per call and reject unknown, foreign, historical unbound, degraded or registry-drifted bindings before engine dispatch. Preserve canonical bound workspace spelling exactly and keep it immutable through observational Learning hooks, so aliases and unrelated workspace observations cannot redirect or split a task.

Breaking pre-1.0 v2 client contract: external memory_v2_read/write calls must supply scope.taskId from controller_learning episode start with a stable taskKey and registered workspace. Old v2 clients receive MEMORY_CONTROLLER_SCOPE_UNAVAILABLE with remediation. Native runtime tasks remain host-bound and existing credential grants and legacy Memory APIs stay enforced. Memory-only interleaving is supported; Learning activation, hooks and finalization must remain serialized.
