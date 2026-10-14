---
"agent-core": patch
---

Keep external tool outcomes bound to immutable pre-dispatch task identity and add bounded best-effort opt-in pre-mutation checkpoints to write_file, edit_block, move_file and code_refactor, preserving the existing checkpoint and mutation owners.
