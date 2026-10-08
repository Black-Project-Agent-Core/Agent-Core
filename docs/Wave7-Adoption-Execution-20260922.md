# Wave7 Selected Adoption — Execution Result — 2026-09-22

**Status: COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS.**

Current activation result: docs/Wave7-Activation-20260923.md. Direct activation evidence: `runtime/tmp/wave7-activation-20260923/`; rollback backup: `runtime/backups/wave7-activation-20260923/`. The implementation/qualification sections below preserve the earlier 22 September checkpoint; their not-activated statements describe that historical phase, not current runtime state.

The user approved PY7-P1, TS7-P1, TS7-P2, S6-P1 and G30, plus the G29.6-R follow-up on the previous failed provider acceptance. This task changed selected native source and isolated provider staging, not the installed production programs. Existing PY6/TS6/S5 candidate changes are preserved and re-tested. The six earlier live selections remain closed/live.

## Implemented state

| Selection | Current implementation | Qualification |
| --- | --- | --- |
| PY7-P1 | Exact BigInt dev/ino/mtime/ctime identities; bounded SHA-256 comparison for uncertain stamps; unknown evidence cannot become fresh merely through elapsed time | Real scanner/coordinator tests; source and compiled candidate |
| TS7-P1 | Bounded incremental SSE/JSON reader with strict response-ID correlation, first-complete-result delivery, owned-reader cancellation, sanitized failures; actual GatewayTransport.call wiring | Real synthetic ReadableStreams and mocked gateway fetch; no Phone command sent |
| TS7-P2 | Concrete-session epoch ownership for pending scans, recent results and snapshots; clear invalidates old owners; superseded work cannot resurrect state or send later effects | Deferred-boundary tests using the actual coordinator |
| S6-P1 | Shared strict native UTF-16 line/column mapping for source extraction and edit planning; LF/CRLF/CR and explicit EOF compatibility; insertion EOL follows first delimiter | Actual semantic read/edit consumers with temporary files, BOM and encoding checks |
| G30 | Test-binary signal refusal and recorder seams at supervisor/CLI/dashboard boundaries; production selection predicates unchanged | Eight no-signal tests; simulated false/test branch never calls an OS killer |
| G29.6-R | Real incremental JS import finalization now uses existing canonical provider classifier and unchanged G26 root-bound/source-first relative resolver | Actual full/incremental pipeline and fresh isolated cold/post-refresh MCP acceptance |

Hashing is bounded to 1 MiB per file, 8 MiB per scan and four concurrent readers; timestamps within two seconds are distrusted. Digest reads reuse the existing guarded regular-file handle and validate pre/post identity and workspace boundary. An I/O deadline produces uncertain/degraded evidence; this does not claim that the OS can always cancel an already-pending filesystem operation instantly.

## Native source scope and prerequisites

Modified: src/semantic-ide/freshness.ts, workspace-policy.ts, source-io.ts, transaction.ts, service.ts, src/mcp/streamable-http.ts and src/phone/gateway.ts. Added: src/semantic-ide/text-position.ts. The buffered parser remains available; no public MCP tools or HTTP routes were removed or added.

Two genuinely missing prerequisites were reconstructed with type annotations from their surviving installed JavaScript: src/net/bounded-response.ts and src/security/file-identity.ts. TypeScript printer comparisons established identical emitted runtime statements; this is narrowly scoped reconstruction, not recovery of an original source file byte-for-byte and not whole-root source repair. The installed programs were unchanged. Other missing dependency source, including sensitive-file.ts, was not recreated opportunistically.

Four new test files contain 57 cases. The existing completeness fixture was updated for the new exact-stamp contract without weakening its assertions. Isolated test configuration resolves pre-existing absent/unselected dependencies to installed JavaScript while always exercising modified selected source or selected compiled candidate; this boundary is recorded in compiled-native-provenance.json. It must not be represented as a fully rebuilt root.

## Observed native verification

| Run | Total | Pass | Fail | Skip/excluded |
| --- | ---: | ---: | ---: | ---: |
| Selected source, 15 test files | 178 | 172 | 0 | 6 |
| Selected compiled candidate, same 15 files | 178 | 172 | 0 | 6 |

These are the same cases through two execution paths, not 356 unique tests. All 57 newly added cases pass. Prior behavioral RED runs are retained: generation 6 fail/2 pass; text positions 10 fail/8 pass; streaming 15 fail/7 pass; file-stamp suite 9 failures. Loader failures are not counted as behavioral RED.

The six unverified native cases comprise two pre-existing host skips and four tests that failed during symlink/junction fixture creation with EISDIR before product code ran. The four were explicitly excluded by exact test-name pattern after preserving their failure outputs; none is graded PASS. The initial positions-green and native-source-selected reports remain evidence, not overwritten. See host-exclusions.json.

Strict selected TypeScript 6.0.3 compilation reports zero diagnostics and builds 36 modules. Eleven candidate programs differ from installed runtime (including three prior unactivated programs); 25 dependencies are byte-identical. The compiled test provenance recorded 28 candidate modules and nine installed unchanged dependency modules across the tested consumers. Candidate root: runtime/build/native-wave7-adoption-20260922/dist.

## G29 root cause and minimal correction

The old settled 18/24 failure was reproduced, not renamed. A cold full-index graph had the correct npm roots and local emitted-extension file target. Re-extracting main.ts through the daemon's actual TryIncremental path replaced those targets with raw import specifiers. Replaying the existing Synthesize function on the stored failed graph corrected two npm endpoints with zero new entities, proving the classifier itself was not the missing piece.

The correction adds a stateless optional typed finalizer at the existing incremental composition boundary, before relationship merge/flow/module aggregation and persistence. The actual daemon passes external.FinalizeIncrementalJSImports. It reuses Synthesize and a thin export over the unchanged root-bound/source-first relative resolver, supplies complete entity context for aliases and changes only newly extracted JS-family relationships. The optional argument preserves old callers and avoids the documented resolve/extractors test import cycle. No Node-side duplicate classifier, new registry, worker, runtime gate or wholesale upstream update is introduced.

The new stage is derived from the previous G29 stage, which remains untouched: runtime/build/grafel-g30-wave7-20260922. Delta against old G29 is exactly eight production Go files and six added test files. G30 changes four production files; G29.6-R changes four. The task-local stored-boundary diagnostic probe was moved into the evidence directory after diagnosis, rather than retained as a normal provider test.

## Provider test and build evidence

| Final selection | Top-level passes | Explicit limitations |
| --- | ---: | --- |
| External synthesis compatibility plus incremental finalizer | 215 | 38 pre-existing skipped subcases; 5,657 pass outcome events include subtests, not 5,657 top-level tests |
| G26/G27 compatibility plus G29 actual pipeline and CLI/dashboard G30 cases | 52 | One unverified host-symlink test skipped |
| G30 process/supervisor cases | 4 | No skipped cases; real OS signal dependency never invoked |

All final package invocations exit zero. The eight G30 tests are split across the last two rows; repeated earlier runs are not additional distinct cases. The first G30 run failed to compile because the proposed guard did not exist; that is not a behavioral RED claim.

The existing project-local Node, TypeScript, Go 1.26, GCC 16 and qualified private linker timestamp helper sufficed. No dependency/toolchain installation or global configuration change was necessary. Candidate build is static-linked and stripped but not trimpath-clean, and is not a stable release archive.

Provider candidate: runtime/build/grafel-g30-wave7-20260922/grafel-wave7-candidate.exe
Size: 110112256 bytes
SHA-256: 7c83af3dd0a8870abd07174792b8f1666319b20111ec4bfda06bb2e18d4bcff3
Version label: v0.3.3-agentcore-g26g27g29g30-candidate
At the historical qualification checkpoint the installed provider remained SHA-256 087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94.

## Final MCP acceptance — two deliberately separate verdicts

**New candidate obligations: 24/24 PASS.** A fresh isolated MCP client tested both the settled cold graph and a later watched graph after an explicit main.ts edit. The actual current-pointer generation had to advance, then index state remain clean/current for three continuous seconds before sampling. The candidate preserves the two npm-root imports, unresolved local alias and local emitted-extension file import plus call in both samples. All 22 provider tool input schemas match the installed baseline. Twenty concurrent health reads share one status chain. Matching source inputs, candidate hash, non-truncated graphs and fixture cleanup are checked.

**Original baseline-and-candidate 24-check matrix: 23 PASS / 1 FAIL.** It is retained unchanged in legacy24-comparison.json. The remaining failed assertion is baseline_G26_emitted_extension_import_preserved: the unmodified old baseline still has the incremental defect. This is an explicit pre-existing baseline finding, not a candidate failure, and the old baseline is NOT declared fixed. Every candidate obligation from that matrix now succeeds. The separate candidate-only cold/warm matrix must not be described as the old matrix turning 24/24 green.

The earlier 18/24 record remains historical evidence of the old G29 candidate. New reports do not overwrite it. Local alias false named external is removed, but an orphan external components node still exists; no universal resolver, graph-accuracy benchmark or orphan cleanup is claimed.

Both isolated services were closed. Independent Win32_Process inspection found zero remaining Grafel processes associated with this candidate/evidence runtime. Production workspace registration, graph data, provider and Node runtime were not replaced or restarted.

## Integrity, documentation and continuity

The final integrity report checks 40 installed artifact paths: 38 existing files remain hash-identical and two candidate-only installed paths remain absent. The old G29 candidate still has SHA-256 ccd6dcd9e8e63235db0c761f91addba7c92e11f449d7a9afbf8a7481a2497f7f. All four protected reference checkouts remain Git-clean at the reviewed HEADs. No reference was deleted, no fetch performed, and no legacy Git restoration or source-tree reset occurred.

The four existing integration plans and CODEBASE are updated in the same task. Canonical implementation continuity uses record 1b2416e6-d8e3-4964-bf29-6e2775ed196f, updated in place from its prior proposal status; the earlier residual record 163fc8f2-9be1-4956-bcaa-7c7a6537fb35 remains historical evidence and points to this later candidate qualification. Actual canonical readback is recorded in docs-memory-readback.json; documentation is not itself runtime activation proof.

Patch intent: .changeset/20260922-wave7-adoption-lifecycle-fidelity.md. Root product version remains 0.12.0. Five pending intent files aggregate to minor/planned 0.13.0, but missing release automation was not repaired or executed. No release apply, packaging, commit, tag, push, deployment, or production restart occurred.

## Remaining work — explicit and separate

**CLOSED: authorized production activation and installed-runtime readback.** Installation completed with 24/24 matching hashes and 27 preserved hashes; installed-dist tests 172 PASS / 0 FAIL / 6 host SKIP-excluded, fresh provider MCP22/22 schemas and live Core/Grafel reads succeeded. See docs/Wave7-Activation-20260923.md and canonical activation record561784e7-96b0-4b24-964a-940751b5e86e. Pre-existing source/Git/release-tooling and managed language-provider damage remain separate.

## Primary evidence paths

Evidence bundle: runtime/tmp/wave7-adoption-20260922/
Scoped backup: runtime/backups/wave7-adoption-20260922/

Key files: execution-summary.json; native-qualification.json; native-source-accepted.json; native-compiled-accepted.json; compiled-native-provenance.json; host-exclusions.json; go-external-accepted-summary.json; go-compat-final-summary.json; go-guards-final-summary.json; g29-pipeline-red.log; g29-pipeline-green.log; g29-mcp-settled-qualification.json; g29-candidate-acceptance.json; legacy24-comparison.json; provider-source-delta.json; structural-review.json; fixture-process-cleanup.json; reference-final-status.json; final-integrity.json; docs-memory-readback.json.
