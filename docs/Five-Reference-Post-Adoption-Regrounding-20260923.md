# Five-Reference Post-Adoption Re-grounding — 2026-09-23

> **Status:** COMPLETE — RESIDUAL CENSUS EXECUTED; ASI-P5 / SL-P2 / S8-P1 / RF-P2 IMPLEMENTED AND VERIFIED, live/operational where applicable; SECONDSIGHT REMAINS RETIRED/DELETED.
> **Scope:** residual value after ASI-P4, SL-P1, SS-P1/P2, S7-P1 and RF-P1, followed by the user-approved residual implementation on 2026-09-23.
> **Execution evidence:** `docs/Post-Regrounding-Adoption-Execution-20260923.md` for implementation qualification and `docs/Six-Plan-Activation-20260924.md` for final live activation/installed-runtime closure.

## Decision summary

| Reference | Residual decision | New proposal |
| --- | --- | --- |
| `awesome-Self-Improving-Agents` | RETAIN | ASI-P5 — evaluator independence/reliability evidence in offline series reporting |
| `01-shiploop` | RETAIN | SL-P2 — explicit read-only workspace/session fingerprint for change attribution |
| `02-SecondSight` | RETIRE / DELETE | none; no additional current-fit native consumer after SS-P1/P2 |
| `03-Serena` | RETAIN | S8-P1 — bounded C# `solution/open` / `project/open` notifications after successful initialize |
| `04-reef` | RETAIN | RF-P2 — expected-active compare-and-swap guard for candidate→active cutover |

Existing implementation stages are not reopened. At the time of this census the new proposals were plan-only; the user subsequently approved them, they were implemented/verified, and the remaining active-dist cutover was closed on 2026-09-24.

## Source census

Task-local structural census: `runtime/tmp/five-ref-regrounding-20260923/source-census.json`.

| Reference | HEAD | Tracked regular | Code-suffix files | Extracted defs |
| --- | --- | ---: | ---: | ---: |
| Awesome | `99ce3979185536c1efb57b5c6935244b56f1dfec` | 49 | 0 | 0 |
| Shiploop | `a238ad853916fd92319c20b83646abd0cde251cc` | 329 | 254 | 856 |
| SecondSight | `3f05d3f681f4b08767aa0026f02d28ab027c442d` | 814 | 312 | 3,753 |
| Serena | `9f19a79a045f3f2681ba7b58f88938b83a81ca8f` | 1,103 | 556 | 7,202 |
| Reef | `5ffac29acddeda199eca369aaf7edf837f642a80` | 1,753 plus 2 gitlinks | 936 | 13,426 |

All five checkouts were Git-clean when the census ran. Structural counts are coverage evidence, not a claim that every branch/function was semantically executed. Selected mechanism/test bodies were read directly; exact current Agent Core source outranks plan prose and Grafel.
## Residual source findings

### Awesome / ASI-P5
`Paper/tex/evaluation.tex` still has one reporting requirement not represented by ASI-P1–P4: separate the evaluator/judge that drives iterative updates from final-report judging, and report judge calibration/reliability evidence. Native retrieval reports already bind evaluator/verifier revisions and separately account evaluator resources; they do not declare update-versus-final evaluator independence or calibration/repeated-judge evidence. ASI-P5 is reporting-only and must never launch a judge/model or infer independence from a label.

### Shiploop / SL-P2
`templates/lib/session-state.sh` computes a deterministic pre/post code-work fingerprint from HEAD plus Git status/diff hashes. A clean search of Agent Core-owned source (excluding vendored/generated/runtime/dist trees) found no generic HEAD+status+diff session fingerprint primitive. SL-P2 is an explicit read-only attribution snapshot; it must not become a worktree governor, hook or mutation gate. Untracked file contents must not be read merely for fingerprinting.

### Serena / S8-P1
MIT SolidLSP C# source sends `solution/open` and `project/open` notifications after successful initialize/initialized, filtering ignored projects; Agent Core has the C# adapter/readiness/restore-request handling but no provider-specific post-initialize project-open phase. S8-P1 therefore has a real C# consumer. It cannot repair the already observed C# initialize timeout because its proposed hook runs only after initialize succeeds. Any native adaptation must use bounded Git-aware workspace/containment scanning rather than upstream's unbounded filesystem walk and must never run restore/MSBuild.

### Reef / RF-P2
`reef/artifact/repository.py` and concurrency tests use expected-head/expected-parent compare-and-swap semantics so a stale publication fails loudly instead of overwriting a head changed by another writer. Agent Core has release transactions, candidate hashes and provider archive verification but no reusable candidate→active runtime cutover that binds installation to the exact active artifact state observed at qualification. RF-P2 proposes that narrow stale-candidate refusal/rollback primitive; it does not import Reef's artifact service, trainer, Git-LFS backend or deployment runtime.

## SecondSight retirement

After SS-P1/P2, no additional current-fit consumer remained. `analysis/output_recovery.py` is a substantial model-output JSON/schema recovery layer, but Agent Core does not currently ask a model for a native JSON-schema result requiring that layer: MCP decoding and outbound retry already have owners, and Hermes' JSON HTTP envelope keeps partner output opaque for lead verification. Directive identity/effectiveness overlaps Memory/Learning and includes fixed heuristic lifecycle decisions that do not meet Agent Core's evidence boundary. SQL/raw-trace retention/backfill/observation belongs to SecondSight's dual-store product architecture, not Agent Core's file-native Tracker/Memory.

Final pre-delete evidence: checkout HEAD `3f05d3f681f4b08767aa0026f02d28ab027c442d`, Git-clean; 814 tracked regular files / 7,252,413 logical tracked bytes; full tracked SHA-256 manifest in `secondsight-retirement-precheck.json`; zero production source/script/test dependency hits; zero reparse points. The first process search found only the audit PowerShell itself. Final check excluding the audit process found zero external process references.

Physical deletion result: `02-SecondSight` absent after deletion at `2026-09-23T07:39:51.5026706Z`. The deleted tree contained 842 files including Git metadata / 10,304,913 logical bytes. These are logical file bytes, not a measured free-space gain. Evidence: `runtime/tmp/five-ref-regrounding-20260923/secondsight-delete-final-precheck.json` and `secondsight-deletion-result.json`.
## Scope limits and non-adoptions

- Awesome has zero executable source in this checkout; its proposal is methodology derived from manuscript source, not a runnable implementation.
- Shiploop governor/dispatch/worktree/staleness/apply/index/evidence systems remain rejected as duplicate/wrong-owner; only the explicit fingerprint concept survives.
- SecondSight source/tests/prompts remain unlicensed for reuse in the local checkout; SS-P1/P2 were independently specified native requirements and remain outside the deleted folder.
- Serena application code is GPL-3.0-or-later; S8-P1 is grounded only in MIT SolidLSP source. S4-C1/additional providers remain conditional, not hidden tasks.
- Reef training/inference/service/recipe stacks remain out of scope; two empty gitlinks (`third_party/cordis`, `third_party/reef-client`) were not fetched and are not claimed audited.

No product source, candidate, active dist, dependency, provider, test suite, build, release, Core restart or deployment was changed by this re-grounding task. Changes are limited to plans/audit/CODEBASE/memory plus the explicitly authorized deletion of the zero-current-fit SecondSight reference.

## Continuity

Updated plans:
- `docs/Awesome-Self-Improving-Agents-Steal-Use-Integration-Plan.md` — ASI-P5.
- `docs/Shiploop-Steal-Use-Integration-Plan.md` — SL-P2.
- `docs/SecondSight-Steal-Use-Integration-Plan.md` — final retirement/deletion record.
- `docs/Serena-Second-Wave-LSP-Freshness-Multi-Language-Integration-Plan.md` — S8-P1.
- `docs/Reef-Steal-Use-Integration-Plan.md` — RF-P2.

Evidence root: `runtime/tmp/five-ref-regrounding-20260923/`. Pre-edit document backups: `runtime/backups/five-ref-regrounding-20260923/`. That sentence was the census-time boundary; the proposals were later selected and are now closed by `docs/Post-Regrounding-Adoption-Execution-20260923.md` plus `docs/Six-Plan-Activation-20260924.md`.

## Final execution closure — 2026-09-24

The residual proposals from this census were subsequently approved and are no longer plan-only. **ASI-P5 is installed/live verified; SL-P2 is complete as a read-only source CLI; S8-P1 is installed/live verified; RF-P2 is operationally verified by the real expected-active CAS cutover.** SecondSight remains retired/deleted and was not recreated.

Current-source compilation exited 0; the focused source matrix passed **47/47**. After cutover/restart, active ASI tests passed **27/27**, installed Semantic IDE tests passed **11/11** across S7/S8/RF-P1, SS-P1 emitted live correlated invocation evidence, and final installed artifact readback matched **18/18** selected JavaScript/sourcemap hashes. Exact evidence and current unrelated health caveats are consolidated in `docs/Six-Plan-Activation-20260924.md`.
