# CORAL - Source-grounded Steal / Use Plan

> **Status:** COMPLETE FOR APPROVED CLI SCOPE - TARGETED/COMPILED QUALIFIED
> **Grounded:** 2026-09-29
> **Inspected location:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/CORAL`
> **Current reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/CORAL`
> **Revision:** `0123dfb939b35228cf2c1fde224cd0561e727408`; branch `main`; clean at initial inspection.
> **Origin:** `https://github.com/Human-Agent-Society/CORAL.git`
> **Licence evidence:** Root Apache-2.0; template/example/vendor notices remain separately applicable.

**For agentic workers:** After explicit selection, use the executing-plans workflow; these proposals do not authorize implementation or verification by themselves.

**Goal:** Verify explicitly selected local evidence references against immutable source bytes without turning a link into proof of truth.
**Architecture:** A native offline verifier/CLI under existing verification ownership. No dependency on the CORAL hub, agent runtime, grader VM or model.
**Spec:** This plan defines the proposed scope; shared boundaries are in `Fourteen-Reference-Steal-Use-Review-20260929.md`.

## Inspection and confidence boundary

Available-file inventory: **3,711 files / 109,351,569 bytes**; **1304 Python files** statically parsed and **70 other code files** indexed lexically. Hashes identify available bytes; they are not passing tests. Selected method bodies and selected assertions were read, not every branch, example or transitive dependency. No donor import, training, model call, test suite or build was run.
Excluded paths and empty submodules are recorded in the inventory. No credential values, environment-file content or private runtime data are used as semantic adoption evidence. Paper/README claims and remote links are leads, not independently checked results.
Evidence root: `runtime/tmp/fourteen-reference-grounding-20260929T152826Z/`; see `CORAL-inventory.json`, `identities.json`, `read-anchors.json`, `native-gap-search.json` and the final lifecycle readback.

## Global constraints

Execution is authorized for P1 only. Preserve native Memory, Reflexion, Skills, Grafel, Semantic IDE and machine-control ownership. No automatic install, workflow execution gate, model/controller runtime, credential, restart, Git-history change or release. New systems are allowed in a selected proposal only when its concrete input/output consumer needs them. Do not recreate a covered subsystem merely to manufacture use for a reference.
User chooses targeted verification; builds/reloads required for activation are distinct from broad tests. A selected material implementation must update its CODEBASE section, canonical Memory and one changeset, without release:apply or auto-commit.
## CORAL-P1 â€” explicit local evidence-reference audit

**SELECTED; implemented outcome is recorded below.** Consumer: the existing controller produces source-grounded plans and task evidence under docs/runtime/tmp. Add an explicit offline CLI that checks a declared set of local source references against actual byte snapshots. It must report broken or changed references, not certify that a claim is true. This is a real file/spec/report operation, not a passive taxonomy, second Memory store or automatic approval gate.

### Source and native comparison

`coral/template/skills/deep-research/scripts/check_grounding.py` supplies the executable local-note/reference checker: orphan findings, missing raw targets, incomplete frontmatter, ledger targets and review-file presence. `coral/template/coral_md.py:71`, the deep-research SKILL.md and `tests/test_check_grounding.py:31-100` connect the checker to an actual generated workflow and pin intended detections. Tests were read, not run.

The donor's regex links, path-prefix checks, skipped read errors and directory conventions are not a complete integrity boundary. A missing root can be skipped, a .review.json file's existence is not an independent review, and its numeric grounding_score is not factual correctness. Do not transplant those verdicts or its automatic research workflow.

Native `scripts/learning/report-bundle.mjs` verifies its specific evaluation bundles; `src/verification/workbook-input.ts` and artifact-integrity reads verify specific inputs. Neither provides the selected cross-document local-reference contract below. The scoped authored-source search found no general evidence-link CLI. Reuse neutral file identity, bounded regular-file and exclusive report facilities rather than importing workbook parsers or starting CORAL.

### Proposed contract and interfaces

Create `src/verification/evidence-links.ts` and `scripts/verify/verify-evidence-links.mjs`:
`verify-evidence-links.mjs --root LOCAL_DIRECTORY --manifest SPEC.json --output NEW_REPORT.json`.
Export `verifyEvidenceLinks(root: string, manifest: unknown): Promise<EvidenceLinkReport>`; the script owns CLI parsing, bounded specification snapshot, exclusive report output and exit codes.

Strict v1 manifest: 1â€“128 `documents`, each with unique `id`, root-relative `path`, and required `sha256:<64 lowercase hex>` digest; 1â€“512 `links`, each with unique `id`, `from`/`to` document IDs, `sourceLine` (1-based), `literal` (1â€“2,000 chars), `basis: root|source-directory`, and optional `targetLines: {start,end}`. Both endpoints must be declared. The literal must occur exactly in that source line and resolve under the declared basis to the declared target. This v1 checks explicitly selected references, not every link in arbitrary Markdown. No inferred citations or automatic recursive directory scan.

Accept UTF-8 text snapshots only. Manifest paths are normalized relative paths; literal may use parent traversal only when its canonical target remains inside root. Refuse URLs, query/fragment syntax, encoded path ambiguity, drive/UNC/device paths, symlinks/junctions and root escape before reading. Spaces and Unicode are supported as literal paths, not split on whitespace. Bounds: specification 2 MiB, each document 2 MiB, combined snapshots 32 MiB, report 1 MiB. Unsupported input, unreadable files or resource limits are unavailable; declared missing files, digest mismatches, absent literals and out-of-range target lines are failed expectations. Do not turn read errors into empty clean results.

Read each document once through a bounded unchanged regular-file descriptor, compare the supplied digest to those exact bytes, and use those same bytes for line checks. Freeze the snapshot map during all link checks; revalidate input identities before writing the report. Reject a replaced/changed input as unavailable, not a mixed-version pass. No execution, remote fetch, embedded resource expansion or source mutation.

Report: schema/algorithm version, root-relative document identities, actual/supplied digests, per-link pass|fail|unavailable reason, selected/checked totals and `semanticSupport: not-established`. Do not include source bodies, secrets or confidence scores. All selected checks must pass for exit 0; completed mismatches exit 1; invalid/unavailable/incomplete checking exits 2. An empty manifest cannot pass. Output must be a new exclusive file and must not alias any input; verify written bytes and preserve all input digests. `automaticApproval`, `memoryPersisted` and `mutatesSources` remain false.

### Task 1 â€” byte-bound link verification

Files: create the helper above and `tests/coral-evidence-links-adoption.test.ts`; reuse existing neutral file guards after reading their current contracts.
- [x] Write fixture assertions for an existing source/target pair with exact digest, literal and line range; a missing target and same-size tampered target must fail, while unreadable or changed-during-read inputs are unavailable.
- [x] Pin empty/duplicate/unknown IDs, invalid digests, Unicode and spaces, mismatched target resolution, escaping parent paths, symlink/junction replacement, unsupported URL/fragment forms and each declared cap.
- [x] After verification approval, run only `npx vitest run tests/coral-evidence-links-adoption.test.ts` to establish the initial failure, implement the helper, then rerun that same scope. Do not change native authentication or filesystem-write semantics.

### Task 2 â€” usable offline CLI and traceable report

Files: the CLI and the same focused test file. The CLI consumes the helper's report, not donor Python code.
- [x] Exercise the actual compiled CLI on synthetic local document/spec fixtures for exit 0/1/2, exclusive-output refusal and input immutability. A requested link that was never checked cannot become pass.
- [x] Include bytes/digest readback, report-size failure and output/input alias refusal; no network calls or model processes may occur.
- [x] Only after selection and authorized qualification, record notices, one material changeset and implemented CODEBASE/Memory state. No runtime activation is required for this standalone CLI; no release apply or automatic commit.

### Review focus

1. A valid local link is not proof that the source entails the claim.
2. Missing/unreadable roots and zero selected links cannot yield a clean success.
3. Same-size changes and links escaping through reparse points must be detected.
4. UTF-8, spaces, line endings and root-relative versus source-relative paths must not silently point elsewhere.
5. Full report coverage and bounded output must remain truthful when input limits or I/O failures occur.

## Other source families and disposition

| Family | Decision |
|---|---|
| Research checker/templates | CORAL-P1 uses the explicit local-reference idea only; no confidence gate, autonomous research agent or regex truth score. |
| `coral/grader/protocol.py`, `subprocess_grader.py` | Conditional CORAL-C1: a selected external benchmark/grader adapter. The venv worker is not an OS sandbox; JSON-on-stdout and process exit alone do not prove task correctness. Native process/result owners already exist. |
| `coral/agent/exit_classifier.py` | Native outcomes already distinguish errors/unknowns. Exit 0, uptime and a substring sentinel are not effect evidence; no new native completion classifier from those heuristics. |
| `coral/hub/attempts.py` | Conditional CORAL-C2: a real shared multi-agent benchmark hub. Atomic replacement is not a multiwriter read-modify-write lock; archive visibility is not physical deletion. Native Memory forget/restore and mutation idempotency already serve current use. |
| Scores/budget classes/leaderboards | Current Learning has explicit statuses/resources/comparability. Ignoring None scores and returning zero for no observations must not replace native unknown accounting. |
| Islands, mutations, model agents, tools, web UI, providers | Conditional CORAL-C1/C2 only with a chosen experiment/UI/provider consumer; no second controller or kernel to make the donor usable. |
| Large examples, benchmarks, vendor libraries/assets | Inventoried, not every branch compiled or exercised. Their volume is not additional verified native capability. |

**Current disposition:** MOVED to Consumer/CORAL after approved CLI qualification; conditional families remain unselected.


## Historical planning reference readback - 2026-09-29

Retained at the original path. Current path: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/CORAL`. Postflight compared **3,711** included file sizes/SHA-256 values with no drift, extra or missing included files; original HEAD `0123dfb939b35228cf2c1fde224cd0561e727408` remains and Git is clean. No symlink/junction or scoped runtime dependency/process consumer was found. Existing native GEPA mentions are attribution comments, not imports from its checkout. No repository was deleted.
Implementation remains unstarted for this review. Actual lifecycle evidence: `runtime/tmp/fourteen-reference-grounding-20260929T152826Z/reference-postflight.json`; plan self-review and native snapshot readback are recorded in final-closure.json.

## Approved execution and qualification — 2026-09-29

The user selected this P1 with the other two independent current-fit proposals. Preceding grounding observations are historical baseline evidence, not a claim that current source still lacks the implemented feature. Conditional C families remain unselected.

Qualification: **116/116 PASS, 0 failure, 0 skip** in the explicit seven-file scope: 79 new adoption tests (CORAL 38, GEA 17, MetaClaw 24) plus 37 selected existing retrieval/manifest regressions. The build passed with path policy 279 authored files / 0 exceptions. An additional **19/19 compiled checks** passed using an in-memory MCP transport and all eight analysis CLI modes; client/server and synthetic fixture were closed/removed. These are scoped tests, not a full-project benchmark or resident HTTP acceptance.

MCP compatibility remains 70 to 70 tools; expectedContentDigest is optional, with no removed/newly required parameter and breakingEvidence=false. Compiled manifest is fresh, 118234 bytes / approximately 29559 tokens, under 120000/30000 budgets. release:check-intent passed; read-only release:plan remains 0.14.0 to 0.15.0, not applied. One new minor intent is .changeset/20260929-coral-gea-metaclaw-adoption.md. No new dependency, donor runtime, model, credential, HTTP listener, automatic restart, Git-history change or deployment.

Grafel was explicitly indexed: current, accepted, 9659 entities / 51413 relationships, registered workspace coverage 1/1. Exact source imports/calls remain authoritative; initial MemoryFeedbackStore impact was broad-module only.

Evidence: runtime/tmp/coral-gea-metaclaw-implementation-20260929T161854Z/ (before-images, source-artifact-identities.json, qualification-final-vitest.json, compiled-acceptance.json, compatibility-result.json, graph-readback.json, reference/move readbacks, result.json). CODEBASE 0.1.77, MEMORY.md, the review index and canonical Memory record 206c85e5-8142-49bf-841b-7a9270b4bc25 retain the same stage distinctions.

### CORAL-P1 implemented behavior and justified adjustment

Implemented src/verification/evidence-links.ts, neutral evidence-snapshot.ts, and scripts/verify/verify-evidence-links.mjs. CLI usage is `node scripts/verify/verify-evidence-links.mjs --root LOCAL_DIRECTORY --manifest SPEC.json --output NEW_REPORT.json`. Documents require `id`, normalized root-relative `path`, and `digest`; links use the declared endpoints, sourceLine, literal, basis and optional targetLines. This is explicit-literal checking, not a complete Markdown parser or proof of semantic support.

The approved read-once/identity-only freshness wording was insufficient on the actual filesystem: a same-size write could preserve observed timestamps and incorrectly pass. The implementation keeps initial frozen byte snapshots as the sole line-check inputs, but additionally performs bounded full-digest revalidation at helper completion and before/after exclusive report creation. This adds at most three document-validation passes (at most 128 MiB total document read I/O across the CLI at the 32 MiB snapshot bound, plus bounded specification/output I/O), not new interpretation or network fetches. A source deleted after opening is unavailable, distinct from an initially missing declared target. The unsafe behavior was observed in focused negative fixtures and corrected; all final tests pass.

The boundary is explicit observed byte/identity snapshots, not an OS-mandatory lock against arbitrary adversarial editors or a guarantee of unchanged files after the last check. Declared missing targets/digest/literal/range mismatches are fail (exit 1); unsupported/invalid/unreadable/changed input is unavailable (exit 2); only complete selected success is pass (exit 0). Reparse ancestors, encoded/URL/device/escaping paths, per-document/specification/combined/report limits and exclusive-output cleanup are tested. A real junction fixture used Windows native Temp because E could not create a junction; only those synthetic fixtures were created and removed.

**COMPLETE FOR APPROVED CLI SCOPE.** No resident activation is needed. CORAL now resides in Consumer/CORAL under the original consumer-only disposition authorization; 3711 included hashes/sizes, HEAD and clean working tree were checked after the move, and the old root is absent. Only C1/C2 future consumers remain; no repository was deleted.
