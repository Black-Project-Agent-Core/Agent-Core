---
"agent-core": patch
---

Add a user-run Windows launcher restart command with serialized execution, exact process identity checks, normal close, residual-runtime checks, and a single launch attempt. First use installs a persistent, highest-privilege Task Scheduler action for the current interactive user after UAC consent; later clicks reuse it without periodic triggers. Validate the fixed action before dispatch and keep per-request results without automatic retries. Requery incomplete process identities and wait for transient shutdown metadata gaps; preserve known helper ownership by PID and creation time, and block launch while any relevant identity remains unresolved. Refuse ambiguous ownership, other Windows sessions, and incomplete shutdown; distinguish the native dump helper from duplicate launcher windows. Exit the CMD wrapper immediately on success while keeping failures visible until a key is pressed. Runtime restart testing remains user-owned.
