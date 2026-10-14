# GenericAgent Steal/Use Integration Plan
> Status: COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — REFERENCE RETIRED
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\05-GenericAgent`
> Pin: `e86ca723a9439acef38349180b33ee31f45e3388`
> License: MIT
> Grounding date: 2026-09-25

## 1. Grounding basis
The fixed checkout contains 366 non-Git files, 125 Python source files and 14 test files.
Grounding used exact source, tests, Git pin, structural indexing, and comparison against current Agent Core source.
README claims were not treated as implementation evidence.

Primary source inspected includes `frontends/worldline.py`, `plan_state.py`, `continue_cmd.py`,
`ga_contract_probe.py`, `cost_tracker.py`, `agent_loop.py`, and `reflect/scheduler.py`.
Current Agent Core comparison included machine-control file tools, Activity Tracker, Memory,
release compatibility, Learning, Semantic IDE transaction safety, and current source-recovery boundaries.

## 2. Selectable proposal
### GA-P1 — explicit file-mutation checkpoint / rewind ledger
Adopt the useful subset of GenericAgent's `RewindStore` into Agent Core-owned TypeScript.
The capability is file-state recovery only; do not transplant GenericAgent's conversation runtime.

Observed source mechanism:
- content-addressed SHA-256 blobs with deduplication;
- tree-shaped checkpoints with parent/children and branch-after-rewind semantics;
- first-touch pre-edit baseline so restore can reach the state before a file was tracked;
- deletion represented explicitly as absent state;
- realpath-normalized identities to avoid duplicate junction/symlink identities;
- atomic blob writes and explicit restore planning.

Current Agent Core gap:
- Semantic IDE has transactional rollback for one semantic mutation;
- backups and RF-P2 CAS protect scoped deployment operations;
- there is no persistent, user-addressable tree of file mutations across ordinary machine-control edits.

Proposed native owner:
- `src/rdc/checkpoints/checkpoint-store.ts`;
- `src/rdc/checkpoints/service.ts`;
- optional single MCP facade `file_checkpoint` with actions `create|list|show|preview_restore|restore|drop`.
Do not make checkpointing an execution gate and do not capture every filesystem read automatically.

Safety contract:
- protected-path policy remains authoritative;
- restore is previewable and fingerprint-bound before mutation;
- no transcript/hidden reasoning capture;
- only explicitly scoped regular files are stored;
- blob/state lives under project-local `runtime/checkpoints`;
- exact path identity, source drift, reparse points, deletion, partial failure, and rollback are covered;
- restoring does not run commands, restart services, or mutate Git automatically.

Acceptance:
1. create checkpoint for existing/new/deleted files;
2. mutate files through existing Agent Core owners;
3. preview reports exact before/after hashes without mutation;
4. restore reproduces byte-identical state;
5. rewind then edit creates a branch without destroying the prior branch;
6. junction/symlink aliases cannot create conflicting identities;
7. protected or drifted targets fail closed;
8. restart preserves checkpoint metadata and blobs;
9. current Memory/Grafel/Semantic behavior remains unchanged.

Release impact if selected: minor if a new public MCP tool is exposed; otherwise patch for internal-only helper.

## 3. Rejected / deferred GenericAgent mechanisms
- Full GenericAgent model/tool loop: REJECT — external AI controller remains the reasoning authority.
- `/continue` transcript reconstruction: REJECT — Agent Core does not own ChatGPT conversation history.
- plan-mode parser/UI: REJECT — not a machine-control capability.
- token/cost monkey-patching: REJECT — Agent Core does not own upstream controller token accounting.
- in-session prompt reviewer: REJECT — existing controller + Grafel/Semantic review owners already cover it.
- scheduler/cron reflection loop: REJECT — would create an unauthorized workflow scheduler/gate.
- `ga_contract_probe.py`: useful evidence pattern but current `release:compat` + external MCP acceptance already own contract compatibility.

## 4. Retirement condition
The reference is NOT a corpse while GA-P1 remains unselected/unimplemented.
After GA-P1 is accepted or rejected, run a final dependency + source-uniqueness census.
Delete only if no current-fit mechanism remains and provenance/notices needed by any port are preserved.

## 5. Approved execution result — 2026-09-25
GA-P1 is implemented in Agent Core-owned TypeScript and targeted-verified. The public `file_checkpoint` facade is additive and release compatibility reports 62 -> 63 tools with no breaking evidence. File checkpoint tests pass 3/3; root TypeScript compilation exits 0. Compiled `dist` contains the candidate, but the connected Node Core has not been restarted, so live activation remains pending. Rollback evidence is retained under `runtime/backups/six-reference-adoption-preactivation-20260925-v013`. Execution authority: `docs/Six-Reference-Adoption-Execution-20260925.md`.

## 6. Live activation and retirement closure — 2026-09-25
Fresh post-restart MCP acceptance reports Agent Core 0.13.0 with 63 tools and `file_checkpoint` present. GA-P1 remains additive and its prior 3/3 capability qualification stands.
Final census at the pinned clean revision found no remaining current-fit GenericAgent mechanism after GA-P1, no active source/script/test dependency on the checkout, no process dependency, and no reparse-point boundary. MIT provenance is retained in this plan and `THIRD_PARTY_NOTICES.md`.
Reference disposition: **RETIRED/DELETED**. The former `05-GenericAgent` checkout is absent after authorized deletion.
