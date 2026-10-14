# Approved adoption execution — 2026-09-22

**Current status: SELECTED RUNTIME ACTIVATION VERIFIED — INSTALLATION/RESTART WORK CLOSED.** Earlier implementation/preparation checkpoints below are historical; the final activation record is current. This is not a claim that all corruption-recovery work is complete.

**Authorization:** the user selected TS5-P1, PY5-P1, S4-P1, G26, G27 and G28 and requested local memory repair and durable evidence capture. Conditional proposals remain unselected. Activation was subsequently authorized and completed by the user-run installer. Independent installed-file, process-start, live MCP and targeted installed-dist evidence now verifies activation; no further manual shutdown or installation is pending.

## Verified native outcomes

| Selection | Current implementation | Evidence |
|---|---|---|
| TS5-P1 | `src/net/outbound-request.ts` sends streams/iterators/unknown bodies once; repeatable bodies retain retry policy. No buffering or inspection of iterator accessors. | Actual body-consumption tests and control cases pass. |
| PY5-P1 | Provider hints are strictly parsed and rounded upward; a hint beyond the remaining budget or timer range ends retry instead of being shortened. Caller cancellation remains terminal. | Fake-clock timing, malformed headers, remaining budget, final response ownership and cancellation tests pass. |
| S4-P1 | `src/semantic-ide/provider-registry.ts` checks parentheses only in the C# name segment before the property/type delimiter. | Tuple/nested tuple/property/method/constructor/explicit-detail cases pass. |
| G28 | `src/code-intelligence/service.ts` requires the exact repo/ref plus a canonical graph-load result; selected-context and group-coverage status are separate. `workspace-resolver.ts` rejects unknown explicit filters. Root health uses the same evidence. | Missing/wrong-ref/empty/unavailable graph, group scope, target routing and root-health tests pass. |

Native targeted result: **45 tests passed, 0 failed**, four test files. Evidence: `runtime/tmp/approved-adoption-20260922/native-final.json` and matching log. Before changes, actual behavior regressions were reproduced: the first three suites had 14 failing/16 passing cases; the initial G28 suite had 8 failing/4 passing cases. A later root-health regression was separately reproduced before its correction.

The very first test attempt ran zero cases because required security-source imports were absent; that attempt is not counted as a behavioral RED result.

## Local memory repair

`memory_list`/`memory_status` initially failed. Filesystem evidence showed a missing `runtime/memory/00-agent-core-memory.md` and an empty notes directory. A new minimal foundation was derived from the read operating contract, not invented historical experiences. Native list/reindex then succeeded; canonical store/index/embedding/intelligence reported available with zero issues. Native remember/readback succeeded for recovery record `46a4013d-695e-4450-9aac-602b2cdcca09`.

The historical malformed-bootstrap detector blind spot is not claimed fixed by this data repair. Deleted old notes are not claimed recovered. No restart was needed for memory recovery.

## Required import reconstruction

Four absent source imports were recreated from exact surviving local compiled bodies with type annotations only: `src/failure-evidence.ts`, `src/code-intelligence/provider-capabilities.ts`, `src/security/redaction.ts`, `src/security/environment.ts`. Comment-stripped TypeScript transpilation was compared with the compiled baseline before writing and matched. This was not a legacy Git restore or a replacement of healthy files. Other missing source/Git state remains outside that narrow reconstruction.

## Initial provider implementation checkpoint (historical)

G26/G27 use isolated staging `runtime/build/grafel-g26-g27-20260922` exported from qualified baseline `45f9745d02f3662a8516fb35cd2d0624acf82cbf`. Only selected changes from reference `5eb5be1255aa7583b6310daf6d98c4fa648c4031` and necessary safety/consumer corrections are eligible. Current provider executable and metadata remain untouched. The resumed selected provider tests and candidate build are now recorded below. Live activation and the listed validation limitations remain separate and unresolved.

**Initial activation checkpoint (historical):** the native results above are source-level implementation and targeted test evidence. The running Node `dist` was not overwritten or restarted. The current-line source remains incomplete after earlier corruption; no full-root build or current-runtime activation claim is made.

## Earlier native readback and compiler boundary (historical)

The post-annotation final native run also passed **45/45**, with no failures: `runtime/tmp/approved-adoption-20260922/native-verified.json`. All four reconstructed prerequisite modules were rechecked against the surviving compiled bodies; `recovered-runtime-parity.json` records four equivalent emitted programs.

At that earlier checkpoint the strict TS 6.0.3 no-emit probe reported **four diagnostics** (superseded by the post-restart result below): missing `src/semantic-ide/types.ts` and three consequent implicit-any diagnostics in provider-registry. The initial separate annotation error in recovered failure-evidence was corrected. This targeted probe is not a complete-root build; the missing type source was not invented or replaced by a permissive stub.

## Durable local records

| Record | Native memory ID |
|---|---|
| Canonical bootstrap recovery, not historical note recovery | `46a4013d-695e-4450-9aac-602b2cdcca09` |
| Approved native adoption outcomes, source versus activation boundary | `71ca3311-98ac-4f70-8b95-4c6da22f4788` |
| Verified project-local Go timestamp/linker recovery | `112ce3eb-0e0c-4821-b35a-3b5449414703` |

The Go linker helper was needed because an actual timestamp probe rejected 1970 and accepted 1980 on this volume. The volume type was reported only as Unknown; no filesystem type is inferred. A source overlay changed only the deterministic temporary-object timestamp; a private `-toolexec` wrapper preserved canonical version output and supplied a distinct cache identity. Installed Go source and active Grafel were untouched. The corrected linker subsequently executed the real baseline tests, which failed on the expected G26/G27 behaviors; earlier linking failures were not counted as behavioral RED.

Pending intent: `.changeset/20260922-approved-adoption-hardening.md` (`minor`). No version application, root baseline refresh, commit, tag, push, publish or deployment was performed.


## Earlier continuation result — 2026-09-22
The continuation read canonical local memory first and resumed existing work rather than recreating it. Fresh native verification passed 45/45 tests, zero failed or skipped, in `native-resume.json`; the command exited 0. A fresh targeted TS 6.0.3 no-emit probe again reported four diagnostics: missing `src/semantic-ide/types.ts`, plus three dependent implicit-any parameters in provider-registry. No broad regression suite or full-root build was run.
Fresh provider verification (`provider-resume.log`, `.exit`, `-summary.json`) exited 0 across eight package invocations. It records 200 passing test/subtest events, 47 passing top-level tests, zero failures and one skipped `TestAgentCoreG26SymlinkEscape` because the host could not create the test symlink. The selected CLI package invocation compiled but reported no runnable matching tests; it is not counted as a tested behavior. No skipped check is called passed.
G26/G27 candidate source remains at `runtime/build/grafel-g26-g27-20260922`. The normalized delta from qualified baseline is 23 production Go files and 35 test files. Root-bound import lookup contains filesystem probes; source-first emitted-extension resolution is shared; quality/history outputs preserve unknown measurement and reject invalid rows. These changes remain provider-owned, not duplicated in the Node facade.
The previously completed candidate build was rechecked by hash and an isolated execution: `grafel-g26-g27-candidate.exe`, 110092800 bytes, SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`; `--version` exited 0 and identifies the selected candidate. Active Grafel executable hash remains `7ceb82ca002628ddbfeaac56a6c136924014a840dea3046afb99c9bc9d8540c8`; provider metadata hash also matches the pre-build record. No live restart/cutover occurred. Canonical MCP source is unchanged against baseline, but no new live MCP handshake is claimed. Static linking was used; trimpath was not, so this candidate is not a final release package.
**Earlier checkpoint, superseded by the activation record below:** native runtime activation is not performed and current-line source recovery is incomplete; provider activation requires the distinct authorization reserved in the selected plan; host-symlink validation was skipped; conditional reference proposals remain unselected. Preserve candidate/staging/references and existing healthy runtime. No extra release intent was added on resume: the existing minor intent remains pending.
Evidence: `runtime/tmp/approved-adoption-20260922/resume-verification.json`, `provider-resume-source-delta.json`, `provider-resume-version.json`, `native-typecheck-resume.json`. The implementation/qualification state is synchronized to the four proposal documents, CODEBASE and canonical local memory `71ca3311-98ac-4f70-8b95-4c6da22f4788`; the existing recovery and linker lessons remain separate records.


## Post-launcher-restart qualification — 2026-09-22
The post-launcher-restart continuation closed the selected native compiler blocker: src/semantic-ide/types.ts was reconstructed from six surviving semantic consumers and the config producer, not recovered byte-for-byte from history. Eleven negative type contracts and the semantic consumer closure compile cleanly; the emitted type module remains identical to the existing empty runtime module. Strict selected TS 6.0.3 no-emit now has zero diagnostics. A selected native candidate dependency closure of 19 JavaScript modules was built under runtime/build/native-approved-adoption-20260922/dist. Both fresh source and emitted-candidate runs passed the same 45 targeted cases, zero failed/skipped; these are two runs of the same cases, not 90 distinct tests. Native active dist was not replaced; no full-root build is claimed.

The existing G26/G27 candidate hash was reconfirmed. A fresh isolated daemon and MCP bridge under the task evidence directory completed initialize/tools-list with 22 canonical provider tools, then the client and daemon were closed; a machine process query found zero remaining candidate processes. This is isolated candidate qualification, not active-provider cutover, full schema/response parity acceptance, or a graph-fidelity benchmark. Prior Go evidence remains 200 passing test/subtest events (47 top-level), zero failures, one unverified host-symlink case; those Go suites were not rerun in this continuation. The candidate remains static-linked without trimpath and is not a release archive.

Evidence: `runtime/tmp/approved-adoption-20260922/semantic-types-reconstruction.json`, `native-typecheck-postrestart.json`, `native-candidate-build.json`, `native-postrestart.json`, `native-compiled-postrestart.json`, `compiled-native-test-provenance.json`, and `provider-candidate-mcp-postrestart.json`. The existing minor release intent remains pending. No active runtime replacement/restart, release apply, Git mutation, external notification or conditional adoption was performed.

**Pre-installation checkpoint (historical; superseded by verified activation below):** complete-root source/Git recovery is not performed; no cutover is inferred from the user restarting the launcher. The selected Grafel plan reserves active provider replacement/restart for distinct authorization. Current source and candidate implementation are qualified within the tests above, not declared live. References/staging remain retained, and historical memory loss/malformed-foundation detection are not claimed repaired.

### 2026-09-22 — Activation preparation (historical; now closed)

**CLOSED: the user completed installation; independent live readback is recorded below.** The user continued after the candidate report and asked that ambiguous boundary wording be replaced with concrete unfinished work.

Fresh comparison found four changed native programs and fifteen unchanged dependency programs. The replacement set is four JavaScript modules plus their four sourcemaps, Grafel executable and its updated provenance metadata. A fresh real-provider comparison returned 22 current and 22 candidate tools with zero missing tools and identical input schemas (`activation-schema-parity.json`). Earlier source/compiled 45-case test evidence remains valid as historical evidence; those suites were not rerun in this activation-preparation pass.

The platform rejected writing the automatic stop/start batch before execution. No production process was stopped and no active native/provider file was replaced. This is a concrete tool limitation, not a maximum-work limit or missing implementation approval. The incomplete automatic helper is archived as text and must not be executed.

`ACTIVATE-APPROVED-ADOPTION.cmd` now launches the task-local `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/install-when-stopped.mjs`. This offline helper never stops/kills processes: it reports running Core/Grafel/launcher PIDs, refuses installation while they remain active, validates the exact allowlisted candidate/current/backup hashes, uses same-directory replacement with scoped rollback on error, and requests launcher start after installation. At this preparation checkpoint only syntax and non-mutating preflight had been executed. The later user-run installation and live startup are verified below; the rollback-on-error path was not exercised. `installer-check.json` reports all candidate/backup hashes valid, alreadyInstalled=false and readyToInstall=false because processes are running.

Verified backup: `runtime/backups/approved-adoption-activation-20260922T095700`. Evidence and future installation result: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/`. The manual shutdown and root activation-launcher step were subsequently completed by the user; they are no longer pending. Preserve OAuth, tunnel, memory, other applications, references and current release version. Full source/Git recovery, the host-symlink check and pre-existing Semantic IDE provider damage remain separate unfinished work; no new release or broad repair was attempted.

### 2026-09-22 — Selected runtime activation verified

**CLOSED: installation and live readback completed.** The user installed the qualified files; independent checks now match all 10 installed files to the activation manifest. Node Core PID 18644 started at 2026-09-22T10:09:49Z after installation and serves the new native modules. The installed G26/G27 provider has SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`, a fresh 22-tool MCP handshake, wire 0.1.0 compatible and health available/current. G28 live status returns graphAvailability/groupCoverage and rejects unknown repo filters.

A fresh run of the same four targeted files against installed root dist passes 45/45 cases, zero failed/skipped, exit 0; this is not a broad regression suite or full-root build. Evidence: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/live-verification.json`, `installed-native-tests.json`, and the user-run `install-result.json`. See `docs/Approved-Adoption-Execution-20260922.md` for the consolidated record. No further installation/restart is required for these selections. Prior host-symlink validation remains unverified; pre-existing Semantic IDE provider damage, complete source/Git recovery, and release tooling repair are separate unresolved work. No new repair, release apply or publication was performed.
