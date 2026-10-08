# Anthropic SDK Python — Source-First Adoption Proposal — Agent Core

**Status:** PY7-P1 / PY6-P1 COMPLETE / LIVE-ACTIVATED / INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS; EARLIER SELECTIONS PRESERVED; REFERENCE RETAINED
**Latest review:** Production activation is complete; see the final activation section and docs/Wave7-Activation-20260923.md. The 2026-09-25 source-first re-grounding found no new current-fit immediate proposal; credential/OIDC and distributed lifecycle families remain conditional. Older NOT ACTIVATED/failed-checkpoint labels below are historical evidence, not current activation tasks.
**Date:** 2026-09-25
**Reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\anthropic-sdk-python`
**Inspected HEAD:** `0af0190679a9e80388bd1b0328d557c9a91a11b2`
**Earlier audit baseline available in this clone:** `7e5ca5c94126a6d7de159a169ff43eb9b1cac57f`
**Document continuity:** the former file at this path was deleted as a proven zero-byte artifact. This document is newly written from current evidence; it is not a recovered copy of the lost plan, and does not manufacture its missing approval/test record.
**Implementation boundary:** no Python/Anthropic runtime, provider, worker, model or dependency is being installed. PY5-P1 has been selected and implemented in native source; conditional families still require separate selection.

## 1. Goal and audit basis
Evaluate reusable client-lifecycle and I/O mechanisms against the existing native Agent Core implementation, not against documentation claims. Preserve explicit user-controlled verification, direct machine-control authority, local release lineage and the existing Memory/OAuth ownership boundaries.
The checkout was clean before the authorized audit marker. The inventory contains 1,685 tracked files and 1,603 code-suffix files, largely including generated resource/types and tests; 34 paths differ from the previous baseline. All inventoried code files were byte-readable. Inventory/hash coverage is not equivalent to a semantic review of all generated code or every remote branch.
Exact changed handwritten `_models.py`, `_response.py`, authentication-header and MCP-adapter code was compared with the baseline. The `_base_client.py` retry policy was read directly and compared with Agent Core `src/net/outbound-request.ts`. Generated organization/rate-limit/vault declarations and SDK model-tool-runner semantics do not establish an Agent Core consumer.
The earlier TypeScript plan and CODEBASE retain historical descriptions of Python-inspired hardening. Present source is the implementation authority. Several old current-line files are now missing after cleanup, so historical claims are not present-runtime acceptance evidence.

## 2. PY5-P1 — Respect provider retry timing without exceeding the local budget
**Historical proposal-stage status (superseded by the live activation record below): APPROVED — IMPLEMENTED IN NATIVE SOURCE — TARGETED TESTED — NOT LIVE. Priority: HIGH.**
**Reference evidence:** `src/anthropic/_base_client.py:777-835` parses millisecond/second/date retry hints; `_calculate_retry_timeout` uses a positive provider-supplied duration rather than replacing it with a short exponential delay. The current source limits extraordinarily long sleeps for platform safety. Agent Core must not copy that long-blocking behavior.
**Current Agent Core evidence:** `src/net/outbound-request.ts:53-65` parses `retry-after-ms` with `Number.parseInt`. `boundedDelay` at lines 99-103 returns `Math.min(providerDelay, 10_000)`. The retry loop at lines 158-177 then checks the budget against the shortened delay.
**Concrete source-derived case:** a retryable response carrying Retry-After 30 seconds with a 10-second retry-delay budget is reduced to 10 seconds and can be retried before the requested 30 seconds. This is a static code-path deduction, not an executed incident. The shared helper already has real JSON/GET consumers in Memory embedding, Phone gateway, provider provisioning and URL/file/PDF reads.
**Native adaptation:** keep the provider's valid requested wait separate from exponential fallback and remaining local budget. If the valid wait cannot fit the remaining budget, return the final response without another attempt; do not shorten it and do not sleep beyond the budget. Honor a finite nonnegative millisecond/second/date value when it fits. Preserve abort-aware waits, the non-idempotent one-attempt rule and exactly-once attempt observation.
**Parser boundary:** reject empty/malformed numeric hints rather than accepting a numeric prefix such as `100garbage`; preserve supported fractional precision without integer truncation. Define finite arithmetic and timer bounds explicitly. A valid hint outside supported bounds must not be silently converted into an earlier retry. With absent/unparseable hints, retain the existing bounded jitter behavior.

### 2.1 Files and acceptance for PY5-P1
Modify only `src/net/outbound-request.ts` for the selected retry calculation/parser and the affected networking section of `docs/CODEBASE.md`. A focused future test file may be `tests/outbound-retry-budget.test.ts`. Do not install the SDK or duplicate its client class.
After user approval of implementation and the exact test, use mocked fetch plus a controlled clock to cover: Retry-After 30s/budget 10s -> one response/no retry/no long sleep; 30s/budget 40s -> wait at least the requested interval then retry; already-spent budget is subtracted; HTTP-date uses the same decision; fractional millisecond hints are not truncated early; malformed/negative/non-finite hints follow the documented rejection/fallback policy; a caller abort interrupts a permitted wait; non-idempotent bodies are never retried; final response body remains readable; event.retry accurately reports the chosen action.
Use expected numerical assertions on both attempt count and scheduled delay, not only a successful final result. This was the pre-selection test design; the approved execution result now records the actual targeted run. A test that mocks the retry helper itself would not prove the production calculation.
The missing `src/failure-evidence.ts` import is a source-reconstruction dependency for a trustworthy full build. Do not opportunistically restore it or change runtime from this planning task. Coordinate PY5-P1 with TS5-P1 in the TypeScript plan because both touch the same existing helper, while retaining separate user choices.
If selected alone this is normally a patch intent. No release apply, baseline refresh, Git mutation, restart or packaging is implied.

## 3. Existing mechanisms and non-candidates
Present `src/net/outbound-request.ts` already implements bounded attempts, safety classes, caller-abort handling, response cancellation before retry, jitter, error-family classification and metadata-only observation. Do not re-propose those merely because the Python SDK also contains them.
The inspected `_response.py` union-type fix and `_models.py` model decoding changes belong to Python/Pydantic representation, not the Node Agent Core transport contract. MCP `zip(strict=True)` and Anthropic beta-header formatting changes do not justify a new MCP adapter or Anthropic protocol dependency. Bedrock decoding, model-refusal fallbacks and tool-runner compaction have no demonstrated current Agent Core owner.
The existing native security/I/O design described in the surviving TypeScript plan remains the correct comparison point. File identity, bounded response handling and atomic persistence must be assessed from present source when repairing missing modules, not automatically reimplemented from this reference.

## 4. Conditional families retained for explicit future selection
Expiring credential caching/single-flight refresh, credential-chain/OIDC precedence, distributed lease/heartbeat workers and external-memory replica reconciliation remain conditional reference families from the prior cross-SDK audit. They do not authorize a new credential authority, worker daemon or memory store. Re-evaluation must first identify an actual approved Agent Core consumer and inspect the exact selected source/tests; until then no installation task exists.
This pass does not assert that all 41 remote refs and every handwritten credential/replica path have exhausted their potential. That limitation is recorded rather than silently converting unreviewed or consumer-dependent material into a zero-value verdict. The checkout must remain available for that evidence and for PY5-P1 review.

## 5. Selection, execution boundary and disposition
- [x] PY5-P1 — approved; implemented, targeted-tested and live-activated; activation verified on 2026-09-22.
- [ ] Reject PY5-P1.
The user subsequently approved PY5-P1 explicitly; the approved execution result records source implementation and targeted evidence. Live activation remains separate.
**RETAIN — NOT ZERO-VALUE.** Preserve the requested `Consumer\anthropic-sdk-python` directory. No other protected checkout is modified.
**Audit output:** this recreated plan plus the same-task CODEBASE status update. No historical missing content is represented as restored; no new tests, builds, SDK installation, network replay experiment, memory rewrite or runtime activation were performed.

## Approved execution result — 2026-09-22 (PY5-P1)
The user approved the six new selections and local memory repair. PY5-P1 is implemented in current native source; the fourth-wave/historical records above do not substitute for this new evidence.
Exact evidence: `runtime/tmp/approved-adoption-20260922/native-verified.json`: 45 passing cases, zero failing cases across the four selected native test files, including this selection. Real behavior regressions were established before the correction; the first missing-import test-loader failure was not counted as behavioral RED.
See `docs/Approved-Adoption-Execution-20260922.md` for changed source, acceptance cases, required-import reconstruction and memory record IDs. Four narrowly necessary missing imports were reconstructed from surviving local dist and their emitted runtime statements were verified identical.
The active Node dist and active provider were not replaced or restarted. The earlier missing-type compiler blocker is now closed by the post-restart continuation below: strict selected checking has zero diagnostics and an isolated native candidate is built/tested. Whole-source recovery and live activation remain incomplete; conditional families remain unselected. No release apply, commit, tag, push or publication occurred.
Native canonical memory repair was verified through list, reindex, remember and readback; historical lost notes were not recreated. Durable execution record: `71ca3311-98ac-4f70-8b95-4c6da22f4788`; recovery record: `46a4013d-695e-4450-9aac-602b2cdcca09`.

### Resumed verification and memory sync — 2026-09-22
The earlier resumed native run passed 45 tests (`native-resume.json`) while its historical compiler probe reported four diagnostics. That compiler blocker is superseded by the verified post-restart result below; the old evidence files remain historical and are not rewritten. See the execution report and canonical memory `71ca3311-98ac-4f70-8b95-4c6da22f4788` for the current candidate-versus-live state.


### Post-launcher-restart qualification — 2026-09-22
The post-launcher-restart continuation closed the selected native compiler blocker: src/semantic-ide/types.ts was reconstructed from six surviving semantic consumers and the config producer, not recovered byte-for-byte from history. Eleven negative type contracts and the semantic consumer closure compile cleanly; the emitted type module remains identical to the existing empty runtime module. Strict selected TS 6.0.3 no-emit now has zero diagnostics. A selected native candidate dependency closure of 19 JavaScript modules was built under runtime/build/native-approved-adoption-20260922/dist. Both fresh source and emitted-candidate runs passed the same 45 targeted cases, zero failed/skipped; these are two runs of the same cases, not 90 distinct tests. Native active dist was not replaced; no full-root build is claimed.
Evidence: `runtime/tmp/approved-adoption-20260922/semantic-types-reconstruction.json`, `native-typecheck-postrestart.json`, `native-candidate-build.json`, `native-postrestart.json`, `native-compiled-postrestart.json`, `compiled-native-test-provenance.json`, and `provider-candidate-mcp-postrestart.json`. The existing minor release intent remains pending. No active runtime replacement/restart, release apply, Git mutation, external notification or conditional adoption was performed.

### 2026-09-22 — Activation preparation (historical; now closed)

**CLOSED: the user completed installation; independent live readback is recorded below.** The user continued after the candidate report and asked that ambiguous boundary wording be replaced with concrete unfinished work.

Fresh comparison found four changed native programs and fifteen unchanged dependency programs. The replacement set is four JavaScript modules plus their four sourcemaps, Grafel executable and its updated provenance metadata. A fresh real-provider comparison returned 22 current and 22 candidate tools with zero missing tools and identical input schemas (`activation-schema-parity.json`). Earlier source/compiled 45-case test evidence remains valid as historical evidence; those suites were not rerun in this activation-preparation pass.

The platform rejected writing the automatic stop/start batch before execution. No production process was stopped and no active native/provider file was replaced. This is a concrete tool limitation, not a maximum-work limit or missing implementation approval. The incomplete automatic helper is archived as text and must not be executed.

`ACTIVATE-APPROVED-ADOPTION.cmd` now launches the task-local `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/install-when-stopped.mjs`. This offline helper never stops/kills processes: it reports running Core/Grafel/launcher PIDs, refuses installation while they remain active, validates the exact allowlisted candidate/current/backup hashes, uses same-directory replacement with scoped rollback on error, and requests launcher start after installation. At this preparation checkpoint only syntax and non-mutating preflight had been executed. The later user-run installation and live startup are verified below; the rollback-on-error path was not exercised. `installer-check.json` reports all candidate/backup hashes valid, alreadyInstalled=false and readyToInstall=false because processes are running.

Verified backup: `runtime/backups/approved-adoption-activation-20260922T095700`. Evidence and future installation result: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/`. The manual shutdown and root activation-launcher step were subsequently completed by the user; they are no longer pending. Preserve OAuth, tunnel, memory, other applications, references and current release version. Full source/Git recovery, the host-symlink check and pre-existing Semantic IDE provider damage remain separate unfinished work; no new release or broad repair was attempted.

### 2026-09-22 — Selected runtime activation verified

**CLOSED: installation and live readback completed.** The user installed the qualified files; independent checks now match all 10 installed files to the activation manifest. Node Core PID 18644 started at 2026-09-22T10:09:49Z after installation and serves the new native modules. The installed G26/G27 provider has SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`, a fresh 22-tool MCP handshake, wire 0.1.0 compatible and health available/current. G28 live status returns graphAvailability/groupCoverage and rejects unknown repo filters.

A fresh run of the same four targeted files against installed root dist passes 45/45 cases, zero failed/skipped, exit 0; this is not a broad regression suite or full-root build. Evidence: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/live-verification.json`, `installed-native-tests.json`, and the user-run `install-result.json`. See `docs/Approved-Adoption-Execution-20260922.md` for the consolidated record. No further installation/restart is required for these selections. Prior host-symlink validation remains unverified; pre-existing Semantic IDE provider damage, complete source/Git recovery, and release tooling repair are separate unresolved work. No new repair, release apply or publication was performed.


## Residual audit after live activation — 2026-09-22

### PY6-P1 — Do not convert an incomplete source scan into LSP deletion evidence
**Status: IMPLEMENTED — QUALIFIED WITH EXPLICIT HOST SKIPS — NOT ACTIVATED. Priority: HIGH (correctness).**
**Goal:** prevent a truncated or unreadable workspace scan from telling a language server that existing source files were deleted.
**Architecture:** reuse the Python SDK's distinction between a failed listing and confirmed absence inside Agent Core's existing workspace scanner and freshness coordinator. This is a native TypeScript adaptation, not an external-memory synchronizer or Python FileStore installation.
**Existing completion:** PY5-P1 and the other five selections remain installed/live as recorded above. This is a different mechanism with a different consumer; it does not reopen Retry-After work.

### Source evidence and actual consumer
Reference root: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/anthropic-sdk-python`, pinned HEAD `0af0190679a9e80388bd1b0328d557c9a91a11b2`.

| Evidence | What the inspected code supports |
| --- | --- |
| `src/anthropic/lib/tools/_file_store.py::_raise_unless_vanished`, `_filenames_in_dir` | Non-FileNotFound listing errors propagate; an unreadable subtree is not silently treated as empty. |
| `tests/lib/tools/test_file_store.py:209-225` | The unreadable-subdirectory test expects PermissionError for hash/list/symlink scans, then expects both files after permissions recover. This test was READ, not executed here. |
| `src/anthropic/lib/tools/_memories.py:822-865` | A remote-delete candidate is corroborated again; a failed path/marker check does not authorize deletion. Only this evidence discipline is relevant, not the remote store itself. |
| Agent Core `src/semantic-ide/workspace-policy.ts::scanWorkspaceSources` | Fallback readdir failures are swallowed; lstat/realpath/stat failures are also swallowed. The result has a truncation flag but no explicit I/O completeness signal. |
| Agent Core `src/semantic-ide/freshness.ts::reconcileInternal` | Missing keys in the next listing become type-3 events. Events and closeDeletedFile occur before the truncation check prevents snapshot replacement. |
| Agent Core `src/semantic-ide/service.ts:788-824` | Real semantic operations reconcile registered folders through this coordinator; degraded freshness is already reportable without becoming a machine-control gate. |

**Source-derived counterexample, not an executed incident:** a complete baseline contains `a.ts` and `b.ts`; a later maxFiles/time-limited scan returns only `a.ts`. Current comparison constructs a deletion event for `b.ts` even though it may still exist. Similarly, EACCES in a previously visible subtree can produce an apparently complete smaller scan. These are LSP notifications/cache-state errors; the code does not physically delete the user's source file.

### Selected design for review
1. Extend the existing scanner result with `complete: boolean`, `ioIssueCount: number`, and a bounded list of safe relative-path/error-code issues. `complete` is false for truncation or any unresolved non-ENOENT I/O failure. Do not serialize file contents or absolute credential-bearing data.
2. Distinguish positively observed absence from access/read failure. Preserve existing protected-path, symlink, extension, and ignored-directory policies. Root disappearance remains an explicit degraded scan, not an empty healthy workspace.
3. Before constructing absence-derived events, require complete coverage. An incomplete scan must produce zero type-3 events and zero closeDeletedFile calls. Do not install a partial listing as a complete baseline.
4. Keep previously known entries not covered by an incomplete scan. Positively observed create/change events may still be delivered within the existing event limit; advance only the stamps for events actually delivered. Do not erase or silently advance undispatched entries.
5. On the next complete successful scan, resume ordinary comparison and emit genuine deletions. Preserve bounded scans, bounded event delivery, and explicit degraded freshness until sufficient evidence exists.

The intended state transition is explicit:
```text
scan.complete = !scan.truncated && scan.ioIssueCount == 0
observed positives = create/change differences for successfully read files
absence candidates = scan.complete ? previousKeys - nextKeys : empty
send at most maxEvents from supported differences
advance baseline only for delivered differences; preserve all uncertain entries
incomplete scan -> degraded; never -> fresh merely because errors were swallowed
```
No delayed-delete worker, remote marker, cloud memory, new disk cache or automatic deletion permission is introduced. The SDK's server-delete grace period is not copied into LSP: completeness is the required local evidence, not elapsed time alone.

### Approved implementation tasks and observed completion
- [x] PY6.1: add `tests/semantic-ide-scan-completeness.test.ts`. Drive the real scanner with controlled filesystem errors and the real coordinator with controlled scanner results; do not replace the coordinator's comparison logic with a mock.
- [x] PY6.2: reproduce the partial-listing deletion and unreadable-subtree cases before production edits. Assert both the exact notification payload and closeDeletedFile call count. Loader/import failures are not behavioral failures.
- [x] PY6.3: modify only `src/semantic-ide/workspace-policy.ts` and `src/semantic-ide/freshness.ts` for the result contract and coverage-aware snapshot commit. Use existing safe source/path helpers; do not reconstruct unrelated missing files.
- [x] PY6.4: verify incomplete/error/complete transitions and the existing freshness/source-safety cases authorized with this selection. Update the relevant CODEBASE scanner description and this result record only after observing outputs.

| Required case | Expected behavior |
| --- | --- |
| Baseline a+b; truncated scan a only | No deletion for b; old b stamp retained; freshness degraded. |
| EACCES or EIO at directory enumeration | Incomplete scan, not empty success; no absence-derived deletion. |
| EACCES/EIO at leaf metadata read | Same preservation, even when directory enumeration succeeded. |
| Genuine missing leaf on complete scan | One type-3 event and one closeDeletedFile; a second complete scan does not repeat it. |
| First scan incomplete | Not promoted to a complete authoritative baseline. |
| Incomplete scan then full recovery | Existing files remain known; later actual changes/deletions become observable. |
| More differences than maxEvents | Only delivered differences advance; remaining changes are eligible next time. |
| Protected/ignored/symlink inputs | Existing exclusion policy remains; no out-of-root read or user-source mutation. |
| Separate workspace roots | A failed scan cannot affect another root's baseline. |
| Successful ordinary scan | Existing create/change/deletion behavior and limits remain compatible. |

Proposed focused command, NOT executed in this audit, from the project root:
```powershell
& '.\runtime\node\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/semantic-ide-scan-completeness.test.ts tests/semantic-ide-freshness.test.ts
```
A full-root build remains a separate source-recovery question. If the selected compile/test closure encounters missing current-line source, record the exact prerequisite; do not restore unrelated old source or silently turn broad recovery into this proposal.

### Tradeoffs, rollback, and selection
The conservative choice can delay legitimate deletion notifications during partial scans. That is preferable to falsely removing existing dependencies from the language server; report degradation rather than claiming complete freshness. Whether a path was excluded by policy versus actually deleted must remain distinguishable during review. This proposal does not claim to solve every filesystem race or same-size/preserved-mtime edit.
Rollback after a later approved implementation is scoped to these scanner/coordinator changes and their matching compiled files. Never roll back user source or memory content. A later behavior change would normally carry a patch intent; no new intent is created for this documentation-only audit. Runtime installation/restart is not authorized by the plan-writing request.

- [x] Select PY6-P1 for native implementation and its listed verification.
- [ ] Reject PY6-P1 with a recorded reason.

**Disposition: RETAIN — NOT CORPSE.** The exact requested Python checkout supplies a concrete current-consumer mechanism, implemented and qualified below. Its older credential-cache/OIDC/lease/external-replica families remain conditional; they are not automatically selected and are not the sole reason for retention anymore.
**Audit coverage:** 1,685 tracked paths, 41 local remote refs and 34 changed paths versus the earlier baseline were inventoried; handwritten file-store/replica/cache paths and selected tests were inspected against native consumers. Generated API/type files and every unmerged branch were not exhaustively semantically reviewed. A positive finding suffices to reject a zero-value deletion verdict; this is not a claim of universal exhaustion.
**Evidence bundle:** `runtime/tmp/four-repo-residual-audit-20260922/`. No Python SDK installation, runtime change, test execution, source repair, release operation or checkout deletion occurred during this planning pass.


### Approved execution result — 2026-09-22

**Current result: IMPLEMENTED — QUALIFIED WITH EXPLICIT HOST SKIPS — NOT ACTIVATED.** User approval supersedes the prior plan-only status. Source-audit descriptions above are historical, not current bug behavior.

The selected implementation and qualification are recorded in `docs/Residual-Adoption-Execution-20260922.md`. Final native source and compiled candidate each report 94 cases: 92 PASS / 0 FAIL / 2 host SKIP. TypeScript 6.0.3 reports zero targeted diagnostics. Exactly six candidate modules differ; 21 dependencies are byte-identical to installed runtime. This is not a full-root build or real-LSP repair.

Evidence: `runtime/tmp/residual-adoption-20260922/`; backups: `runtime/backups/residual-adoption-20260922/`; canonical memory: `163fc8f2-9be1-4956-bcaa-7c7a6537fb35`. Two native symlink tests are EISDIR-blocked by the host, independently reproduced and explicitly skipped rather than called PASS. The four references and active dist/provider/metadata/package hashes remain unchanged. The new patch intent does not apply a release or activate candidates. Cold-fixture bootstrap ordering and pre-existing source/Git/provider issues remain separate, documented limitations.

### Cross-selection final handoff

This native selection retains its verified result. G29 has a separate final MCP acceptance failure (18 PASS / 6 FAIL), documented in docs/Residual-Adoption-Execution-20260922.md. No candidate has been activated.

## Post-implementation source-first re-grounding — 2026-09-22

**Status: APPROVED — IMPLEMENTED — CANDIDATE QUALIFIED WITH EXPLICIT SKIPS — NOT ACTIVATED.**
**Spec:** the user requested re-grounding of the four exact steal-use-repos checkouts, proposal updates before installation, and retirement only after a supported zero-value determination. This section is a new selection, not permission to activate PY6-P1.
**Continuity:** PY5-P1 remains live/closed. PY6-P1 is already implemented and qualified with explicitly recorded host skips, but NOT ACTIVATED. The earlier top-level PLAN ONLY label for PY6-P1 was stale; its execution result is preserved rather than rerun or reimplemented.

### PY7-P1 — Identity-aware source stamps with bounded distrust of recently written files
**Goal:** avoid reporting an unchanged unopened dependency solely because a rewrite preserved its byte length and mtime.
**Architecture:** adapt the FileStore hash-cache trust discipline into the existing Semantic IDE scanner/coordinator. Reuse the native bounded source-read/identity helpers; no Python SDK, no external-memory replication, no new canonical store or background watcher.
**Evidence class:** current source comparison and source-derived counterexamples. No new behavioral test was executed during this audit.

| Exact source | What it establishes |
| --- | --- |
| Reference `src/anthropic/lib/tools/_file_store.py:266-289,351-357,410-424` | Cached hashes depend on mtime + ctime + size; young stamps within a two-second margin are not trusted for cache reuse. Hashes are streamed. |
| Reference `tests/lib/tools/test_file_store.py:419-509` | Read tests explicitly exercise same-length/restored-mtime rewrites, fresh timestamp distrust, the 1.5-second boundary and later stable caching. These are upstream specifications, not tests run here. |
| Native `src/semantic-ide/workspace-policy.ts:125-131,249-274` | WorkspaceSourceFile currently exports only mtimeMs and size as freshness metadata. |
| Native `src/semantic-ide/freshness.ts:12-15,30-31,77` | Stamp equality and snapshot projection discard ctime and file identity; equal mtimeMs/size produces no change event. |

**Concrete deduction:** after a complete baseline, a same-size rewrite with restored mtime of an imported, unopened file can pass stampEqual and produce fresh/no-change. PY6-P1 fixes scan completeness and absence inference, not this equivalence relation. An already-open document may have a separate resync path; that does not establish freshness of every unopened dependency.

### Selection contract and precise scope
Modify `src/semantic-ide/workspace-policy.ts`, `src/semantic-ide/freshness.ts`, and only the necessary bounded-read seam in `src/semantic-ide/source-io.ts`. Add `tests/semantic-ide-stamp-freshness.test.ts`. Keep the external reconcile signature and current 4000-file / 1000-event / 5000-ms bounds.
Proposed internal metadata: `identity: { dev: string; ino: string; mtimeNs: string; ctimeNs: string; size: number }`, plus `digest?: string` and `evidence: metadata | digest | unknown`. Serialize exact BigInt values as decimal strings, never as lossy numbers. Keep mtimeMs/size for existing consumers until their source closure is checked.
1. Read handle/path metadata through the native authorized root boundary. A positively changed identity, ctime, mtime or size is enough to issue a change; it need not read the entire file.
2. For apparently equal but recently written/coarse-ambiguous stamps, compare SHA-256 only when both snapshots have trustworthy digest evidence. Apply the reference two-second distrust margin to cache reuse, not as a delay or a deletion grace period. A missing comparison digest means unknown, not unchanged. Establish a digest at the first eligible uncertain baseline; an unknown baseline never becomes trustworthy merely because wall time later passes the margin. Require a new reliable comparison first.
3. Bound extra hashing to 1 MiB per file and 8 MiB per reconcile, inside the existing scan deadline; these are proposed initial limits, not measured optimal values. Larger files with ambiguous equal metadata remain explicitly degraded until a targeted reliable comparison is possible. Do not silently skip that uncertainty and report fresh.
4. Use a four-reader maximum for extra digest I/O and the existing source safety checks. A changing handle/path identity, unreadable file or spent budget yields unknown/degraded and keeps prior evidence. Do not send deletion or mutate user source.
5. Store evidence only in the existing in-memory snapshot lifecycle. Advance stamps for delivered differences only, retaining PY6 event-limit and incomplete-scan guarantees. Do not install an unbounded second cache. Clear the digest evidence with the same root/session invalidation; coordinate with TS7-P2 when both are selected.

```text
if metadata changed positively: candidate event = change
else if old/current metadata are cache-trustworthy: unchanged under documented metadata assumption
else if both bounded digests are valid: compare bytes by digest
else: evidence unknown; preserve baseline; return degraded
commit evidence only for a delivered event or a positively proven unchanged entry
```

### Implementation tasks after selection
- [x] PY7.1: freeze exact source hashes and add failing cases using the real scanner and WorkspaceFreshnessCoordinator; filesystem metadata/clock boundaries may be controlled, not the comparison algorithm.
- [x] PY7.2: extend the scanner result and snapshot projection together; use BigInt identity without exposing contents or adding another store.
- [x] PY7.3: add bounded digest comparison only for uncertain timestamp cases; maintain fail-soft degradation, root safety and delivered-event snapshot commits.
- [x] PY7.4: run the focused matrix below and the existing completeness/freshness/source-safety suites; compile only the selected dependency closure.
- [x] PY7.5: record exact results, corresponding compiled candidate hashes, CODEBASE and local memory; a later runtime activation remains explicit and separate.

| Required case | Expected observation |
| --- | --- |
| Same-length rewrite, restored mtime, changed ctime | One type-2 event; second unchanged successful scan does not repeat it. |
| Atomic replacement at same path/size/mtime | Changed dev/ino evidence detects replacement without numeric precision loss. |
| Identical recent file twice | Digest comparison prevents a false change while refusing a timestamp-only shortcut. |
| Controlled coarse equal stamps, changed same-size contents | Both eligible digests differ; emits change rather than fresh/no-change. |
| 1.5-second-old versus more-than-two-second-old stable stamps | The documented trust-margin policy, not an arbitrary sleep, controls reuse. |
| Read error, file larger than ambiguous-read limit, deadline or total-byte exhaustion | Prior state preserved and degraded/unknown reported; never deletion or claimed unchanged. |
| More than maxEvents and partial scan | PY6 preserves undispatched/uncertain entries; no regression to repeated first-event starvation. |
| Two roots, symlink escape, caller-protected files | No cross-root evidence sharing or out-of-scope read. |

Proposed command after selection, not executed now:
```powershell
& '.\runtime\node\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/semantic-ide-stamp-freshness.test.ts tests/semantic-ide-scan-completeness.test.ts tests/semantic-ide-freshness.test.ts tests/semantic-ide-source-safety.test.ts
```

**Tradeoffs / limits:** extra reads cost time; metadata may be adversarially preserved beyond the margin, and remote/coarse filesystems have different guarantees. This proposal is not a universal file-content integrity proof. Do not transplant the upstream claim that ctime cannot be restored to every Windows filesystem. Unknown is an intentional reported state, not a silently accepted success.
**Rollback:** only the selected scanner/coordinator/helper code and matching compiled candidate. Do not roll back user files, memory, graph annotations, or earlier PY6 changes. One patch release intent would be appropriate at implementation; no new intent is created by this plan update.
- [x] Select PY7-P1 and its bounded verification.
- [ ] Reject PY7-P1 with a reason.

**Attribution:** the local reference LICENSE was read; keep the Anthropic 2023 copyright and permission notice for substantial copied/adapted source or tests. No SDK dependency is needed.

### Source-family census and retirement decision
The exact checkout remains `0af0190679a9e80388bd1b0328d557c9a91a11b2`. Inventory: 1685 tracked files, 41 locally available remote refs; all 1685 regular tracked files were byte-read and hashed. Code-suffix inventory is 1603 files, including generated declarations and fixtures; it is not a claim that 1603 independent mechanisms were semantically audited.
Request/retry/response/cancellation mechanisms are covered by the already implemented native networking waves or remain reconstruction concerns when current source is missing. FileStore scan-error discipline is covered by PY6; its stronger stamp/cache discipline supplies PY7. Credential/OIDC and remote lease/replica families remain conditional without a selected consumer; model APIs, Bedrock/Vertex dispatch and model tool-runner loops are not native Agent Core needs. Generated resource/type families and examples do not justify a second client/runtime.
The review read selected production paths plus upstream tests, and compared them to current native consumers. Local ref names were inventoried without fetch; every unmerged branch and generated file was not semantically exhaustively reviewed.
**Disposition: RETAIN — NOT ZERO-VALUE.** PY7 has a specific present consumer and is independently selectable. Neither missing activation of PY6 nor zero native reference-path imports is grounds for deleting this checkout.
Evidence: `runtime/tmp/four-repo-regrounding-20260922/` (inventory, byte hashes, current-source snapshot, findings and final readback). No SDK installation, source patch, test suite, build, restart, release, or reference deletion occurred in this audit.


### Wave7 approved execution result — 2026-09-22

**IMPLEMENTED — CANDIDATE QUALIFIED WITH EXPLICIT SKIPS — NOT ACTIVATED.**

PY7-P1 now uses exact BigInt identity and bounded digest evidence; the real nine-case stamp suite is green and previous completeness/freshness behavior is retained. Hashing is limited to 1 MiB/file, 8 MiB/scan, four readers and the existing scan deadline. Unknown evidence stays degraded; no second store or Python runtime is added.

Selected native source and compiled runs each report 172 PASS / 0 FAIL / 6 host SKIP or explicit exclusions from 178 cases, including 57 new passing cases. They are two executions of the same case set. Strict selected TypeScript 6.0.3 compilation has zero diagnostics; 36 candidate modules include 11 differences from installed runtime and 25 byte-identical dependencies. Missing unselected dependency source used installed unchanged JavaScript only through recorded isolated test configuration. No full-root rebuild is claimed.

Evidence: runtime/tmp/wave7-adoption-20260922/execution-summary.json, g29-candidate-acceptance.json, legacy24-comparison.json, provider-source-delta.json, final-integrity.json and docs-memory-readback.json. Consolidated report: docs/Wave7-Adoption-Execution-20260922.md. Scoped backup: runtime/backups/wave7-adoption-20260922. Canonical memory: 1b2416e6-d8e3-4964-bf29-6e2775ed196f.

Historical candidate qualification ended before production installation. Its activation item is now CLOSED by the 2026-09-23 readback below. Earlier test/skip/failure evidence is retained; conditional unselected families remain unselected.


### Production activation and installed-runtime readback — 2026-09-23

**COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS.** The user approved activation; 24/24 selected artifact hashes now match the qualified build, with 27 preserved dependency/package/launcher hashes unchanged. Installed-dist tests: 172 PASS / 0 FAIL / 6 unchanged host SKIP-excluded of 178 cases; all 11 modified programs are present in loaded-module provenance.

Node Core PID 5600 started after installation; Core HTTP200/ok, Execution/Memory/Learning available, Grafel available/current with zero issues. Fresh installed-provider MCP handshake retains all 22 input schemas; live code_orient status/search succeed. No manual user action or OAuth reset was needed. G29/G30 build is installed, not merely staged.

Six unverified native host cases and the three pre-existing managed-language-provider issues remain explicit; no language-server repair or whole-root recovery is claimed. Prior candidate-only graph 24/24 and old-baseline matrix 23/24 remain separate historical qualification results.

Report: docs/Wave7-Activation-20260923.md. Evidence: runtime/tmp/wave7-activation-20260923/. Backup: runtime/backups/wave7-activation-20260923/. Canonical activation memory: 561784e7-96b0-4b24-964a-940751b5e86e. OPEN activation items for this selected scope: NONE. No release apply, version bump, commit, push or reference retirement occurred.

## Five-reference source-first re-grounding — 2026-09-25

**Status: PREVIOUS PY WAVES CLOSED/LIVE — NO NEW CURRENT-FIT INSTALLATION — CONDITIONAL CREDENTIAL/LIFECYCLE REFERENCE RETAINED.**
The requested checkout remains clean at `0af0190679a9e80388bd1b0328d557c9a91a11b2`. PY6/PY7 and earlier networking/file-safety adaptations remain closed and were excluded from candidate discovery.

Direct source readback reconfirmed the remaining unique families: `credentials/_cache.py` two-tier advisory/mandatory refresh with leader/waiter single-flight, invalidation-safe forced refresh and late-stale-publication protection; credential-chain/workload-identity/OIDC exchange; and external worker/replica lifecycle patterns. Current Agent Core has no OIDC/federation/workload-identity consumer and no distributed claimed-work or external replica owner. Its OAuth store is inbound/server-side and does not satisfy that consumer condition.

These mechanisms stay **conditional**, not selected. Re-ground only when a concrete outbound credential or distributed-work/replica owner exists. Generated API/model/provider surfaces remain wrong-owner for Agent Core.

**Disposition: RETAIN — NOT CORPSE.** No new current-fit immediate proposal was found at this pin.
Evidence: `docs/Five-Reference-Conditional-Regrounding-20260925.md`.

## Approved conditional execution closure — 2026-09-25

**APPROVED — CONDITIONAL CREDENTIAL / OIDC / DISTRIBUTED-LIFECYCLE FAMILIES DORMANT — REFERENCE RETAINED.**
The user approved the plan. Current Agent Core still has no OIDC/workload-identity consumer, outbound token-provider owner, distributed claimed-work heartbeat/TTL owner, or external replica owner. The Python token-cache/credential/lifecycle families remain source-qualified references and are intentionally not installed without those consumers. No Python SDK/runtime or helper dependency was added.
