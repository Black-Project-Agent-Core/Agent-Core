# Shiploop - Source-Qualified Steal/Use Integration Plan

> Status: COMPLETE — SL-P1/SL-P2/SL-P3 CLOSED; SL-P3 TARGETED VERIFIED / EXPLICIT CLI AVAILABLE; REFERENCE RETIRED.
> Date: 2026-09-23.
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/01-shiploop`.
> Pin: `a238ad853916fd92319c20b83646abd0cde251cc` (anshss/shiploop).
> Disposition: RETIRED / DELETED after final zero-value and dependency/process/workspace safety census; no Shiploop governor/runtime is installed.

## 1. Goal, architecture and scope

Give the operator a precise, read-only view of the always-loaded Agent Core instruction footprint and reviewable duplication, without truncating instructions or inventing a context gate. The smallest useful adaptation is Shiploop's block-aware, content-bound reporting, not its ticket dispatcher or autonomous governance system.

Use the existing Node runtime, safe regular-file reader and explicit scripts. `src/mcp/agent-protocol.ts::loadAgentProtocol` remains the authority for loading the complete mandatory contract. Existing release/MCP compatibility budgets remain their own owner. No Bash/jq runtime, Git hooks, second agent, ticket database, scheduler, automatic compression or policy relocation is proposed.

Only this audit and plan writing are authorized now. Installation, tests, source changes and activation require selection. All steps below describe proposed work, not current behavior.

## 2. Pinned source evidence

| Source at the pin | Actual implementation inspected |
| --- | --- |
| `templates/govern/claudemd-trim.sh::ct::parse/ct::load` | Separates headings, fenced blocks, bullets and prose; records line ranges and block identities. |
| Same file, `ct::find_block/ct::verdict_live` | Operator verdicts are attached to block content; ambiguous matches are refused. |
| Same file, detect/report branch | Classification/reporting is separate from explicit `--apply` mutation. |
| `templates/govern/context-budgets.sh` | Measures file/section footprint outside dispatch, with report-only handling of the main instruction file. |
| `templates/govern/test/test-claudemd-trim.sh` | Source assertions cover non-mutation, protected rules, duplicates, stale verdicts, partial paths and unprovable citations. Inspected, not run. |
| `templates/lib/session-state.sh` | Session delta fingerprint avoids attributing pre-existing dirty work to the current session. |
| `templates/govern/validation-record.sh` | Distinguishes self-attestation from mechanically checked claims and attempts to preserve pre-existing evidence. |
| `templates/govern/sync-templates.sh` | Counterpart-based mirror selection and pinned enumeration upper bound, not indiscriminate directory synchronization. |

Native comparison: `loadAgentProtocol` reads and returns the full nonempty `AGENTS.md`; it does not emit section/block footprint or duplicate-review evidence. `createAgentCoreMcpServer` may append `PHONE_SKILL_INSTRUCTIONS`. A file-size report must not pretend to measure the complete server instructions unless it also accounts for that composition. Existing `release:compat` measures the MCP manifest and must not be duplicated or replaced.

Important source limitations: Shiploop labels several `wc -c` counts as characters. Its normalized block hash may erase meaningful code whitespace. Its citation existence search can be incomplete and cannot establish that a rule is obsolete. Its explicit apply path is not a transaction suitable for mandatory Agent Core instructions. None of those behaviors should be imported unchanged.

## 3. SL-P1 â€” Bounded context-footprint and block-review report

**Selection: APPROVED â€” IMPLEMENTED â€” TARGETED VERIFIED.**

Proposed owners:
- `scripts/inspect/context-footprint.mjs` â€” explicit CLI and read-only output.
- `scripts/inspect/context-blocks.mjs` â€” small parser/identity helper only if separate reuse improves tests.
- `tests/context-footprint.test.ts` â€” new focused fixtures after selection.
- Documentation in this plan and the appropriate CODEBASE instruction-loading section.

Input: an explicit allowlisted instruction path, default `AGENTS.md`, plus optional explicitly supplied comparison snapshots. Do not scan all drives, memory notes, protected references, home directories or provider conversations. The mandatory contract is reportable but never writable by this command.

Output contract:
1. Source path, SHA-256, exact UTF-8 bytes, Unicode scalar count and line count. A tokenizer-free token count is `not-measured`, not an exact estimate.
2. Bounded heading/block entries with kind, line range, raw-byte digest and size. Preserve fenced code, nested/continued bullets and tables conservatively; malformed or unsupported Markdown is an opaque review block, not discarded text.
3. Exact duplicate candidates with both locations and original source hash. Do not deduplicate by collapsed whitespace or imply that duplication is necessarily wrong.
4. Explicit scope: file-only versus separately supplied composed instruction inputs. Report any unmeasured phone/system/client contribution; do not imply a context-window total.
5. Review-only recommendations and `sourceMutated:false`. Missing/partial/unreadable input is an error or incomplete report, never an empty healthy file.

No `--apply`, `--delete`, automatic appendix, stored approval ledger or runtime hook. Do not infer dead rules from absent citations. Protected contract sections are never proposed for automatic omission, and the loader continues to return every instruction exactly as before.

Proposed bounds: at most 16 explicit files, 1 MiB per file, 5,000 reported blocks and 2 MiB result. Report truncation/omitted counts explicitly. Reuse the existing identity-bound file reader; final source hash must match before emitting the result. Output defaults to stdout; an optional file target must be new/exclusive, never `AGENTS.md`, canonical memory or the input file.

### Implementation tasks after selection

- [x] SL1.1 Inspect current safe-file and argument helpers; chose existing identity-safe `readArtifact` and kept the mandatory loader byte-for-byte unchanged.
- [x] SL1.2 Added focused fixtures for fences, bullets/tables, CRLF, Unicode, malformed fences and exact duplicates.
- [x] SL1.3 Added the bounded parser/report command with raw-byte/source identity preserved.
- [x] SL1.4 Added negative oversized-input coverage; output uses existing exclusive writer and input/output collision refusal. The blocked duplicate-output smoke attempt made no mutation.
- [x] SL1.5 Targeted tests pass; CLI smoke on `AGENTS.md` reports 34,573 bytes / 75 blocks with unchanged input hash. No TypeScript build is required for this `.mjs` CLI.
- [x] SL1.6 CODEBASE/docs/memory are synchronized under the combined five-plan execution; pending patch intent exists. Loader policy/release/runtime restart remain unchanged.

Suggested verification after approval, from the project root:
```powershell
& './runtime/node/node.exe' './node_modules/vitest/vitest.mjs' run tests/context-footprint.test.ts
```

Acceptance: reports are deterministic for identical bytes, every displayed range belongs to the hashed input, repeated wording is only a review candidate, and the input remains byte-identical. The existing MCP initialization still includes the full contract. Fewer reported bytes alone is not a capability gain.

Rollback: remove only the new command/helper/tests and selected documentation/intent; there is no migrated instruction or memory state to recover.

## 4. Source-family disposition ledger

| Family | Decision and reason |
| --- | --- |
| Block/context review | SL-P1; exact reporting is useful without automatic editing. |
| Governors, dispatch selection, worker/advisor supervision, merge/CI loops | Wrong owner and incompatible execution model; no autonomous orchestration or cross-tool gate. |
| Prompt guards, preflight denial, watchdog/reminder hooks | Do not install a second policy layer or allow copied prompts to override AGENTS. |
| Worktree create/reap/registry, Git hooks and branch rules | Existing explicit machine control/Git boundaries; current Git recovery is separate. No automatic checkout, cleanup, commit or branch switching. |
| Validation files, evidence labels and durable learning | Existing SIE evaluation/decision evidence and native Memory/Learning already own the required concepts. Do not add a parallel evidence sink. |
| Session fingerprints | Useful reference, but a new Git-backed session ledger lacks a demonstrated current consumer and root history is incomplete. Not a hidden implementation task. |
| Template mirror sync and configuration/scaffold updates | Requires a real managed template fleet; none is established here. No mirror/marker introduced merely to import this script. |
| Flow extraction, path-triggered gotchas, rules on touch | Memory source-aware retrieval and Grafel Patterns are current owners. No copied ticket/flow store justified. |
| Benchmarks, assets, publication/install tooling | Reference/test-design context, not production capability or benchmark evidence. No installers executed. |

## 5. Licensing, coverage and evidence limits

The local LICENSE is Apache-2.0 and NOTICE attributes Ansh Saxena. Preserve the applicable license/NOTICE and changed-file attribution if selected code is substantially adapted. Root script names and a public GitHub listing do not authorize installing the whole project.

File accounting: 329 regular tracked files, 3,427,542 working-tree bytes excluding Git; 254 selected code-suffix files are structurally indexed, including tests. Full file hashes and family accounting are in `runtime/tmp/four-ref-grounding-20260923/`. Selected source and test bodies listed above were inspected semantically. Structural indexing is not a claim that every shell branch, historical commit, benchmark or asset was executed or fully reviewed.

The checked worktree is retained and remains Git-clean. No runtime dependency on this reference is introduced. The sentence above describes the original grounding audit; the approved implementation is now complete for SL-P1. `scripts/inspect/context-footprint.mjs` is source-usable without a Core restart, while no dependency install, release apply, or runtime policy mutation occurred. See `docs/Five-Plan-Adoption-Execution-20260923.md` for current verification and activation boundaries.

## 6. Post-SL-P1 residual source census — SL-P2 proposal — 2026-09-23

**Status: SL-P2 IMPLEMENTED — TARGETED VERIFIED. Reference retained pending any future zero-value census.** SL-P1 remains separately implemented.

### SL-P2 — explicit workspace/session fingerprint for change attribution

Source basis: `templates/lib/session-state.sh` builds a deterministic code-work fingerprint from repository HEAD plus hashes of `git status --porcelain=v1` and `git diff HEAD`, so a later session can distinguish pre-existing dirtiness from changes observed after the snapshot. The useful mechanism is the snapshot identity, not Shiploop's governor/ticket lifecycle.

Native comparison: a clean search of Agent Core-owned `src`, `scripts` and `tests` (excluding vendored/generated/runtime/dist trees) found no generic workspace/session fingerprint primitive using HEAD + status + diff evidence. Existing Grafel freshness, release baseline, Activity Tracker, scoped backups and file identities solve different problems. Codebase indexing, validation records, release parity, automatic staleness gates, worktree governance and deterministic apply are otherwise duplicate or wrong-owner.

Proposed owner: a new explicit read-only CLI/helper such as `scripts/inspect/workspace-fingerprint.mjs`, invoked only with operator/controller-supplied repo roots. At most 16 roots. For each Git repo record resolved root, HEAD (or explicit no-HEAD state), exact Git status digest/count, tracked diff digest/byte count and a deterministic aggregate fingerprint. Do not emit patch contents. Untracked paths may contribute only bounded status/path-set evidence; do not read or hash untracked file contents, so the report must state that untracked-content changes at the same path are not proven.

Comparison mode accepts two explicit snapshots and reports `unchanged`, `changed`, or `not-comparable` per repo with the changed evidence dimensions. It is evidence only: no stash/reset/checkout/commit/worktree creation, no automatic per-tool hook, no gate and no claim that a changed fingerprint was caused by Agent Core.

Implementation after selection: RED fixtures for clean/dirty/staged/untracked/no-HEAD/multi-repo states, status ordering, path safety and before/after comparison; implement bounded Git subprocesses with time/output limits and current protected-path rules; verify input repos remain byte/state-identical. No Bash runtime or Shiploop governor is installed.

Disposition: RETAIN for SL-P2. Other Shiploop source families remain rejected after current native comparison: `codebase-index.sh` duplicates Grafel, validation/evidence stores duplicate native Learning/Tracker, release parity duplicates release compatibility, and staleness/rules-on-touch/deterministic-apply/worktree automation would create prohibited secondary routing or mutation gates. Evidence: `runtime/tmp/five-ref-regrounding-20260923/`.


## 7. Final approved-scope closure — 2026-09-24

**COMPLETE — OPEN IMPLEMENTATION ITEMS NONE.** SL-P1 and SL-P2 remain explicit read-only source CLIs and therefore have no resident Node activation step. The current finalization matrix re-ran SL-P2 workspace-fingerprint coverage successfully; the prior SL-P1 context-footprint verification remains authoritative. Neither command mutates instructions, Git state, worktrees, or runtime routing. See `docs/Six-Plan-Activation-20260924.md` for the combined closure ledger.
## 8. Post-SL-P2 source-first re-grounding — SL-P3 proposal — 2026-09-25

**Status: SL-P3 PROPOSAL — USER REVIEW REQUIRED — NO IMPLEMENTATION. Reference retained.**

The fixed source remains `a238ad853916fd92319c20b83646abd0cde251cc`. Its 329 tracked files are dominated by 252 shell sources and 158 test-shaped files. The only working-tree dirtiness during this audit is the temporary `.grafel` audit marker; no tracked Shiploop source was edited.

### SL-P3 — explicit bounded verification-output compactor

**Source basis:** `templates/govern/verify-filter.sh` captures a verification command, suppresses noisy output on success, preserves the wrapped command's exact exit code, and emits bounded tail output on failure. `templates/govern/test/test-verify-filter.sh` directly checks one-line PASS output, absence of leaked successful output, stdout/stderr retention for failures, exact non-zero exit codes, tail bounding, transparent kill-switch behavior and temporary-file cleanup.

**Current native gap:** Agent Core can compact already-recorded MCP history, but source inspection found no explicit developer verification helper that prevents a large successful build/test output from entering controller context in the first place while preserving the child process result.
**Proposed owner:** one explicit Node CLI under `scripts/verify/`, using only the existing project-local runtime. It remains an operator/developer helper and never wraps MCP machine-control calls automatically or becomes a build/test gate.

Proposed behavior:
- accept only an explicitly supplied command argument vector;
- capture output in a scoped temporary file with a hard size ceiling and guaranteed cleanup;
- for a successful child process, emit one compact summary with label, elapsed time, line/byte counts and optional digest instead of the captured body;
- for a failed child process, preserve its exact result and emit a bounded diagnostic tail with an omission marker when earlier output was removed;
- expose an explicit transparent/debug mode without changing result semantics;
- default to no durable raw-output copy; any future evidence destination must stay explicit, bounded and path-safe.

Implementation after selection:
1. Reimplement the small mechanism in Node rather than adding Bash/jq as Agent Core dependencies.
2. Add focused fixtures for success suppression, stderr failure, several non-zero results, large-output failure tails, interrupted processes, zero-output commands and temporary cleanup.
3. Keep retry, approval, release and source-mutation authority outside this helper.
4. Document it as optional verification-output hygiene; existing Agent Core authorization rules for tests remain unchanged.
### Final family disposition for this fixed checkout

- SL-P1 context/block reporting and SL-P2 workspace fingerprint remain closed.
- `validation-record.sh` mechanical-versus-self attestation overlaps current Learning evaluation/decision evidence and the RF-P3 evidence-strength proposal; do not create a second validation ledger.
- ticket selection/landing, worktree governor, pre-dispatch gates, automatic merge, escalation queues, statusline/hooks, template sync and worker supervision remain wrong-owner because Agent Core intentionally has no ticket/governor execution layer.
- token/session telemetry, gotcha injection and context-budget enforcement are not adopted as automatic controller gates; current Activity Tracker, explicit reporting and mandatory full AGENTS loading retain ownership.
- No additional current-fit mechanism was found in this fixed pin beyond SL-P3.

**Disposition:** RETAIN for SL-P3 review. No Shiploop runtime, hook, worker or dependency is installed by this planning pass.
## Revalidation — 2026-09-25

Source-first recheck at clean pin `a238ad853916fd92319c20b83646abd0cde251cc` reconfirmed SL-P3 as the only remaining current-fit residual in this fixed checkout. `templates/govern/verify-filter.sh` still provides pre-context success-output suppression, exact exit-code preservation, bounded failure-tail output and cleanup semantics, while current Agent Core scripts still have no equivalent explicit verification-output compactor. No additional non-duplicate current-fit mechanism was found after excluding SL-P1/SL-P2 and rejected governor/worker/ticket families.

**Disposition remains: RETAIN — SL-P3 PROPOSAL ONLY / USER REVIEW REQUIRED / NOT IMPLEMENTED.** No Shiploop runtime/hook was installed and no product test/build/restart/release or reference deletion occurred.

## 9. SL-P3 approved implementation qualification — 2026-09-25

**IMPLEMENTED — TARGETED VERIFIED — EXPLICIT CLI AVAILABLE.** The Node compactor already existed in current source when execution resumed. Targeted acceptance exposed one real defect: stdout/stderr arrived asynchronously into one shared tail buffer, so a late stdout chunk could evict the most useful stderr failure evidence.

The implementation now keeps bounded stdout and stderr tails separately. Failure output reserves space for stderr first, fills the remaining budget from stdout, preserves the child exit code, emits an omission marker when needed, and still removes scoped temporary capture state. Successful output remains suppressed to a compact summary; transparent debug mode remains explicit.

Focused acceptance now passes **5/5** cases, including success suppression, bounded failure diagnostics with stderr preservation, debug transparency, zero-output success, and capped capture cleanup. This is an explicit developer CLI only; it is not an MCP wrapper, retry controller, build gate, hook, or autonomous verifier.

No dependency was installed and no resident activation/restart is required for this source CLI.

## 10. SL-P3 final closure and reference retirement — 2026-09-25

**COMPLETE — TARGETED VERIFIED — REFERENCE RETIRED.** SL-P3 remains an explicit source CLI and requires no resident service. Final focused acceptance is **5/5 PASS** after the stderr-preservation correction.

Before retirement, the Shiploop pin remained exact and Git-clean; final safety census found zero reparse points, zero live process references, zero Agent Core `src/scripts/tests` dependencies, and no Grafel workspace registration. Full tracked hashes were preserved in activation evidence, and Shiploop NOTICE/Apache-2.0 provenance was retained in root `THIRD_PARTY_NOTICES.md`.

The checkout `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/01-shiploop` was then deleted and read back absent. Deleted tree: 357 files / 8,864,731 logical bytes including Git metadata. This is a retirement record, not a measured free-space claim.
