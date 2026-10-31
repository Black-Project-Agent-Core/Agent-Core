# REA harness

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## External REA Reconstruction Harness

- External AI can call `reconstruction_harness` after the contract handshake and canonical Memory inspection. Call `action=schema` for the complete manifest format and a valid example; the compact public schema intentionally leaves manifest validation to the existing strict, bounded evaluator.
- Before `preview`, `assess` or `readiness`, start/resume a `controller_learning` episode with a stable taskKey and registered workspace. Owner, task and workspace identity come from the host; do not supply or invent them in the manifest.
- Run the actual task tool, then obtain its `tool:<invocationId>` reference from `controller_learning(action=episode, episodeOperation=status)` in `current.events[].evidenceRefs`. Declare the claim/obligation and select that receipt. Only current-scope receipts whose source tool is permitted by the credential can satisfy an obligation.
- `preview` never verifies evidence. `assess`/`readiness` currently support positive host tool-completion proof only; missing, foreign or insufficient proof stays unknown/open. A ready tool-completion claim does not prove behavior, reconstruction fidelity, semantic/binary equivalence or user-goal success. No target execution, automatic approval, Skill activation or Memory/Learning write is authorized by the report.
- This external adapter reuses the existing evaluator. Native and external capabilities retain their own runtime identity and task-scoped grants. No separate Skill installation is required to invoke this tool.

