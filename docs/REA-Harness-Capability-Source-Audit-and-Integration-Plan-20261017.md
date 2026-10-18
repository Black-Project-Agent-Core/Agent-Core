# REA → Agent Core — Source-Audited Harness Capability Study & Integration Plan
**Date:** 2026-10-17 (Asia/Jakarta)
**Current status (2026-10-17):** APPROVED — NATIVE SOURCE + TARGETED TESTS VERIFIED — NEW BUILD LOADED BY RESIDENT WITH HEALTH OK — DIRECT LIVE NATIVE HARNESS CALL UNEXERCISED — EXTERNAL MCP DESCRIPTOR UNCHANGED. §11 is the latest activation readback; §§0–10 retain study/pre-activation chronology.
**Authoritative target:** E:\Projects\Agent-Core
**Donor checkout (protected, read-only):** E:\Projects\Agent-Core\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\rea
**Donor origin:** https://github.com/morluto/rea.git
**Donor pinned HEAD inspected:** 79d2b718963b28d5b5ce42cda67db648827a9a23 (main; recorded commit timestamp 2026-10-17 15:41:07 +0800)
**Donor package:** rea-agents 6.5.0; repository root LICENSE MIT; third-party engines/notices retain their own obligations.
**Agent Core observed product source version:** 0.15.0-beta.3 (root package.json); precise active runtime/build/manifest was not retested.
**Original source-study scope (superseded by approved implementation):** investigate donor source, tests and wiring; create a proposal without deployment, compilation, testing, engines, targets, checkout changes or release. Later approval authorized the scoped native implementation and targeted tests in §10, not release/upload/restart.

## 0. Executive decision
**Recommend a native, evidence-first Reconstruction Harness**, using REA's deterministic proof-obligation, evidence-bundle, contradiction and readiness mechanisms, while reusing Agent Core's existing authorization, artifact inspection, evidence snapshots, Learning, tool-activity receipts and Code Intelligence. Do **not** transplant REA's server, BinarySession, provider fleet or second evidence database.

Proposed first public capability, only after separately authorized implementation and host-manifest budget proof: **reconstruction_harness**. Preferred first internal implementation: **src/harness/reconstruction/** under existing Agent Core composition. The harness consumes verified *receipts and declared claims*, not untrusted executable targets. No memory, graph, provider or tool invocation is automatically promoted to a verified reconstruction result.

The user asked for a capability plan, not permission to execute/reverse-engineer a third-party target. Accordingly this document does not claim parser execution, end-to-end adoption, benchmark superiority or permission to run REA against any external application.

## 1. Evidence hierarchy and audit method
Source of truth order for this study: observed current code and Git identity > read-only tests and call paths > current Agent Core source > historical docs/Cortex continuity > README/speculation. Source code proves *implemented paths*, not that they work on every host. Test source proves *asserted intended behavior*, not that tests passed today. Evidence categories below are **O** observed source, **H** historical evidence, **I** inference, **P** proposal, **U** unverified.

Read-only census: donor checkout **4,192 Git-tracked paths**, including **2,020 TypeScript files in src**, **522 src *.test.ts**, **970 tests/**/*.test.ts**, **32 bridge/** and **13 third_party/** paths. These are inventory counts, NOT claims that every path or test was read. Deep inspection concentrated on architecture, 15+ representative source families, crucial tests, proof types, and native parity. No broad line-by-line proof of the other files is asserted.

### Audited study loops
| Loop | Concrete question | Evidence inspected | Counter-check / outcome |
|---|---|---|---|
| L0: pin/continuity | Is this exactly the previously researched REA? | Git origin/HEAD/status; package.json; Cortex previous research | **No**: historical reference pinned 788964d..., current is 79d2b71...; 289 selected application/domain/server/composition paths changed since previous pin. Prior conclusions are leads, not current proof. |
| L1: mechanism | Is this a working architecture rather than README promises? | src/main.ts → composition/binary.ts → src/server/createServer.ts → registerInvestigationTools.ts → service/domain | **O:** concrete MCP/CLI registration and typed services. Full server intentionally excluded as redundant. |
| L2: proof claims | Does REA distinguish result, authority and proof gaps? | evidenceBundle.ts, EvidenceLedger.ts, reconstructionVerification.ts, ReconstructionObligation* and Readiness* | **O:** content-bound records, explicit unknowns, dependency closure, declared claim verification; see §2. |
| L3: negative routes | Can incomplete evidence be mistaken for success? | test source: obligation authority/closure, reconstructionReadiness, reconstructionVerification; integrity findings | **O:** negative expectations exist for weak authority, missing dependency, noncanonical/duplicate records and false equivalence. **U:** tests were not executed during this study. |
| L4: native parity | Which features would duplicate Agent Core? | src/artifact-analysis/*, auth/artifact-authorization.ts, verification/evidence-*.ts, learning/workflow-evidence.ts, effect-evidence.ts, workflows/analyzer.ts, MCP facade | **O:** static artifact scan, byte/link binding, source graph, activity evidence and Learning already exist. Only proof-obligation synthesis remains a significant unique gap. |
| L5: adversarial design | Can donor semantics transfer safely without target execution? | same source plus native limits/identity, donor license/notices and MCP tool budget history | **I/P:** yes for bounded, no-target-execution evidence review; NOT demonstrated as installed. External runtime analysis, live replay and side-effectful providers excluded. |

**Audit stopping rule:** stop proposing when a capability has an existing native owner, lacks a present consumer, requires unauthorized target execution, or adds a duplicate store/provider. Revisit only on new source or changed consumer evidence. This is not a claim that all possible future REA functions are exhausted.

## 2. REA mechanics established from source, not documentation
### 2.1 Proof-carrying Evidence and residual unknowns — ADOPT A NARROW ADAPTER
- **O:** src/domain/evidenceBundle.ts parses an EvidenceBundle with artifacts/providers/environments/scenarios/captures/unknowns/records. Duplicate IDs and noncanonical manifests are rejected. src/application/investigation/EvidenceLedger.ts records immutable Evidence, rejects conflicting identities, validates incoming bundles prior to merge, and carries revisioned unknowns.
- **O:** src/domain/reconstructionVerification.ts verifies only claims explicitly in a specification. The output warns that passing all declared claims does NOT prove global implementation equivalence.
- **Important limit:** REA's session EvidenceLedger is an in-memory owner. Agent Core must not gain a second canonical Memory/evidence store. Agent Core source/hash/tool references need an explicit provenance adapter; a caller-submitted payload cannot authenticate its own asserted authority.
- **Negative study:** reconstructionReadiness.test.ts contains expectations for mismatched semantic evidence IDs, noncanonical manifests and duplicate record IDs. These expectations were inspected, not run.

### 2.2 Reconstruction Obligation Ledger (ROL) — HIGHEST-VALUE UNIQUE MECHANISM
- **O:** src/application/ReconstructionObligationLedgerService.ts validates input, derives candidates, evaluates them, emits deterministic ledger Evidence.
- **O:** ReconstructionObligationLedgerEvaluation.ts + ReconstructionObligationLedgerIntegrity.ts combine required obligations, ownership/dependency graph, contradiction diagnostics, missing verifiers, required-case kinds, closure digest, coverage and residual unknown IDs.
- **O:** ReconstructionObligationAuthority.ts checks whether an evidence authority satisfies the claimed proof authority. Ledger status distinguishes ready/open/failed/unknown; empty obligations => unknown, never vacuous ready.
- **O:** reconstructionObligationLedgerSchemas.ts defines case kinds **positive / negative / malformed / cancellation / teardown**, statuses **unowned / characterized / implemented / verified / contradicted / blocked / out-of-scope / unknown**, and proof authority such as **unit / integration / protocol / renderer / packaged-process / native-abi / live-observation / external**.
- **O:** authority/closure test source checks weak generic replay claims, chained missing dependencies, deterministic result and closure identity.
- **Native gap (O/I):** Agent Core Learning evaluates verified outcomes and its evidence-links verifier checks declared file/line references, but does not currently expose this reconstruction-specific owner × case × authority × dependency closure ledger as one first-class harness contract.

### 2.3 Verification and Readiness — ADOPT DECLARED-CONTRACT SUBSET
- **O:** src/domain/reconstructionReadiness.ts derives a digest-stable report from stages and findings; fail/unknown/truncated/unsupported/skipped do not silently become pass.
- **O:** reconstructionReadinessIntegrityFindings.ts rejects false equivalence when evidence is truncated, unavailable, unstable or contradicted, and checks ambiguous concurrency/order claims.
- **O:** reconstructionVerification.ts binds comparison claims to actual evidence IDs/provider predicate/authority and returns recommended probes for unresolved claims.
- **Counterevidence:** the REA readiness test source explicitly accepts 1,001 capability entries. Do NOT reuse unbounded donor schemas as a public input surface. Agent Core needs its own hard limits, depth controls, quotas and output accounting.
- **Limit:** a deterministic report is a verifier of the stated contract/evidence, not independent proof that a reverse-engineered program is correct. User/model-asserted verifier status alone is insufficient.

### 2.4 Static analysis and parser extensions — PARTLY ALREADY ADOPTED
- **O:** REA JavaScriptArtifactAnalysis.ts composes JS parsing, source-map resolution, module semantics and graph projection. Source tree also contains Electron, browser, managed, wasm, native, Android and many provider-specific workflows.
- **O:** Agent Core already owns src/artifact-analysis/{javascript,asar,managed,worker,service,contracts}.ts, bounded worker and artifact_inspect prepare/status/inspect. Formats are **directory-js, asar, managed-pe**.
- **O:** current donor HEAD specifically records an Electron unknown-resource-size correction. Unknown sizes must stay unknown; do not assert complete enumeration based on absent sizes.
- **P:** later optional artifact format expansion (WASM/ELF/Mach-O) requires an actual user case, narrowly owned byte parser, rights grant, platform conformance and no developer tool execution. Not part of first wave.

### 2.5 Provider/runtime integration and browser observation — MOSTLY REJECT/DEFER
- **O:** REA AnalysisProviderRegistry.ts, BinarySession, BrowserObservationService, WebRuntimeService and Register*Tool modules own a large multi-provider lifecycle, browser endpoint scope and optional runtime observation.
- **O:** Agent Core already has browser_control structured observations, host-bound task control, Code Intelligence/Grafel, Semantic IDE, worker resource ownership, evidence capture and process tools.
- **Decision:** no REA MCP server, autonomous analysis-session manager, embedded model, Ghidra/IDA/JEB/Frida runtime, target attach, browser CDP override, executable instrumentation, package downloader or OS-wide dependency installer. They would duplicate native owners and materially increase authority/risk.
- **P:** a later separate opt-in, passive browser artifact analysis proposal is possible only if its evidence is not already exposed by Agent Core's browser/Code Intelligence owners and the user approves the target/session explicitly.

## 3. Native parity / consumer matrix
| Mechanism | Actual native source owner | Parity judgment | Decision |
|---|---|---|---|
| Static JS/ASAR/PE subject and findings | src/artifact-analysis/*, src/mcp/artifact-inspect-tools.ts | Existing, three formats | REUSE; don't copy REA parser fleet |
| Request/task/workspace permit and byte recheck | src/auth/artifact-authorization.ts, artifact-analysis/service.ts | Existing, host-bound and local operator permit | REUSE; no permission inheritance |
| Read snapshot, hash, path and source link | src/verification/evidence-snapshot.ts, evidence-links.ts | Existing; semanticSupport explicitly not established | REUSE and preserve epistemic boundary |
| Controller invocation/goal evidence | src/learning/workflow-evidence.ts, effect-evidence.ts; Activity Tracker | Existing, but causation not established from link resolution alone | REUSE; not a proof authority upgrade |
| Source workflow structural scan | src/workflows/analyzer.ts | Existing, bounded source graph | REUSE for declared source owner context |
| Code surface/generation evidence | src/code-intelligence/* and MCP code_* | Existing provider-backed structure; source remains authority | REUSE, check index freshness |
| Reconstruction obligation/case closure | No equivalent single first-class native contract observed in inspected owners | Unique, high impact | ADOPT narrowly |
| Reconstruction readiness and negative proof gates | Native evidence/learning covers parts, not full ROL gates | Partial overlap | ADOPT only missing logic |
| General REA artifact comparison/deep CIL/JS semantic IR | Native supports simpler static and code graph, not full REA analysis | Expensive, cross-boundary | DEFER unless explicit case |
| Runtime/attached process reverse engineering | Native process and browser tools are separate owners, not REA deep provider | High authority and safety cost | REJECT from this proposal |

**Critical tool-surface constraint:** historical Agent Core Batch13 report counted **79 compiled MCP tools and 131,025/131,072 schema bytes**, only 47 bytes headroom at that specific historical build. Current connector advertises 79 Agent_Core actions, but this study did **not** perform a fresh compiled descriptor byte measurement. New public tool is CONDITIONAL on fresh manifest-budget and compatibility checks. Do not smuggle new functionality into an unrelated schema or claim public tool viability from a historical count alone.

## 4. Alternatives compared (engineering judgment, not measured performance)
Scale: benefit/feasibility/reversibility 1–5 higher is better; risk/effort 1–5 higher is worse.
| Route | Benefit | Feasibility | Risk | Reversibility | Effort | Verdict |
|---|---:|---:|---:|---:|---:|---|
| A. Native read-only ROL/readiness engine atop existing evidence/permissions | 5 | 4 | 2 | 5 | 3 | **SELECT** |
| B. Run REA directly as a second MCP server/process/provider fleet | 3 | 2 | 5 | 2 | 5 | REJECT |
| C. Build a third unified semantic/evidence database and agent workflow from scratch | 3 | 2 | 4 | 2 | 5 | REJECT |
| D. Only add a Skill telling the controller to reason about proof cases | 2 | 5 | 1 | 5 | 1 | Useful guidance, but NOT an enforceable harness capability |

First-principles rationale: the invariant is **“a claim is not verified until the required evidence authority, cases, scope, dependencies and contradictions are actually closed.”** This is a deterministic bounded evaluation problem, not a demand for another AI agent or semantic vector database.

## 5. Proposed first-wave harness architecture
~~~text
User-authorized task and native controller
    ├── artifact_inspect (existing static authorized target)
    ├── code_surface / code_symbol (existing source or LSP evidence)
    ├── existing evidence snapshot / tracker / Learning receipts
    └── explicit claim + case manifest (data, NOT authority)
                   |
                   v
        Native receipt admission adapter
        - exact task/workspace/owner identity
        - stable bytes/revision/provenance
        - no untrusted authority promotion
                   |
                   v
       ReconstructionHarnessService (NEW)
        - canonical bounded Evidence projection
        - obligation ownership/dependency graph
        - required cases and proof authority
        - contradictions and residual unknowns
        - deterministic closure + readiness
                   |
                   v
          bounded signed-off report
       ready/open/failed/unknown + reason
       coverage/omitted/probe suggestions
                   |
              user / controller
       (never auto-execute / auto-persist)
~~~

**Proposed native owners (implementation requires separate approval):**
- src/harness/reconstruction/contracts.ts — strict revisioned DTOs, finite case kinds/status/authorities and input ceilings.
- src/harness/reconstruction/receipt-adapter.ts — re-validate ONLY host-owned tool/byte receipts; require exact task owner/workspace binding and freshness.
- src/harness/reconstruction/obligations.ts — deterministic ROL subset: owner, dependency chain, cases, contradictions, authority comparison.
- src/harness/reconstruction/readiness.ts — strict fail-closed report; eligible coverage, unresolved gates and actionable probes.
- src/harness/reconstruction/service.ts — bounded request orchestration, cancellation, stable report identity, redacted output, no file mutation.
- src/mcp/reconstruction-harness-tools.ts — OPTIONAL single public MCP facade if fresh tool budget + routing contracts pass; else keep internal candidate and return a concrete budget blocker for an explicit integration choice.
- src/mcp/server.ts and src/agent-capability-catalog.ts — additive wiring only if facade approved; no implicit permission expansion.

**No new** canonical Memory store, LLM, Qdrant cluster, event bus, process daemon, provider runtime, tool executor, authorization bypass, trusted target metadata cache, or auto-install task.

### Conceptual tool contract — proposal only, NOT available now
Name: **reconstruction_harness**. Actions: **preview / assess / readiness**. Inputs: exact host task binding; bounded approved receipt references; bounded manifest with claim IDs, required case kinds and expected evidence authority; optional existing static artifact revision ID. Returns: schemaVersion, task/scope digest, tool version, coverage, obligations, decisions, missing cases, contradiction links, unknowns, recommended probes, limitations, redaction/omission counts. It MUST NOT accept a self-asserted "verified=true" as a trust signal or read arbitrary file paths beyond the source grants.

Report status:
- **ready** only when non-empty required obligations have supported owners, fresh matching proof, all required cases and dependencies, and no unresolved contradiction/truncation.
- **open** when work/cases remain even if observed evidence is sound.
- **failed** for demonstrated contradictions or failed required verifier.
- **unknown** for missing/unavailable/ambiguous evidence, stale hash, invalid scope, unreadable required input, cancellation with ambiguous settlement or partial coverage.
Never represent **unknown** as success; distinguish failed evaluation from execution failure and no applicable claims.

Proof tiers: static structure can support **static** claims, not runtime behavior; a valid file digest proves byte identity, not semantic correctness; a provider result is not independently verified merely by being structured. No implicit graduation from source/preview to live/packaged/native authority.

### First-wave resource and security limits (initial engineering proposal)
- Input claim manifest <=256 KiB; max 32 claims, 64 obligations, 128 explicit receipt references, 8 dependency edges per obligation, 8 cases per claim.
- Bounded emitted report <=64 KiB UTF-8 including limitations/omissions; emit summary + page pointer only if existing native bounded paging is explicitly approved.
- Reuse existing artifact worker caps (2 workers/60 sec) for artifact data; pure proof evaluator should need no worker for tiny bounded schemas. If an evaluator becomes expensive, add an isolated, cancellable worker only after profiling.
- Preserve native path symlink/reparse checks, cancellation semantics, scope grants, task identity, evidence-capture redaction and no partial authorized payload spill.
- Artifact content from an approved REA study must never be written to Cortex, Qdrant, canonical Agent Core Memory or logs by default. Any later durable lesson requires separate qualified Learning evidence and authorization.
- Rights to copy donor code (root MIT) are distinct from rights to inspect a third-party binary or disclose its results. Vendored GPL/other component code and proprietary engine bridges are NOT within the adopted scope.

## 6. Audit-driven study questions still requiring implementation-time proof
1. Can existing artifact_inspect produce exact host-owned result receipts that can be referenced by the harness without caching or re-reading sensitive content? Inspect current tool invocation state, not model-supplied IDs.
2. Is the native tool-manifest host byte limit still 131,072 at the target client? Measure fresh compiled tools/list and alternative compact schema budgets. No tool count assertion until this passes.
3. Which minimum proof authority is legitimately available for each case: static, unit, controlled replay, protocol, packaged executable, native ABI, or real live observation? Static artifact scan cannot satisfy the latter five.
4. Can one missing dependency propagate fail-closed across an obligation chain and remain unknown rather than disappear from a summarized report?
5. Do existing evidence-link v2 bound claims convey only link identity? Yes from source; do NOT misinterpret them as semantically supported reconstruction evidence.
6. Does a command string named "verifier" correspond to an actually observed completed test receipt? No from a string alone.
7. What is the correct cleanup behavior when an evaluation request is cancelled after a partial report? Preserve uncertainty, settle owned resources and do not emit ready.
8. Does a profile with 1,001 capabilities get rejected before unbounded evaluation? Donor test accepts that input; the native boundary must enforce its own caps.
9. Can a malicious artifact or forged external evidence introduce instructions via an observation? Treat all artifact content as data, apply redaction and never run it.

## 7. Targeted qualification matrix (NOT run in this study)
| ID | Required acceptance / negative gate | What it establishes |
|---|---|---|
| H01 | Valid deterministic minimal obligation + claim + two byte-bound receipts | stable report identity and correct simple closure |
| H02 | Empty obligations, missing required case, missing verifier, no valid owner | never vacuous ready |
| H03 | Forged evidence ID; duplicate semantic ID; noncanonical manifest | rejects malformed provenance |
| H04 | Current vs stale artifact digest; same-size changed bytes | identity changes invalidate evidence |
| H05 | Cross-task / owner / workspace receipts and expired/revoked target permit | deny without disclosure |
| H06 | Static evidence presented as packaged-process/native-ABI proof | authority mismatch remains unverified |
| H07 | One missing leaf dependency in A→B→C, cyclic or dangling dependency | fail-closed propagation and bounded graph |
| H08 | Conflicting evidence/contradiction that coexists with a prior pass | no false equivalence |
| H09 | Partial inventory, unavailable parser, truncated output, omitted findings | coverage lowers result to unknown |
| H10 | Cancellation/timeout, worker crash, late settlement | resource release and no ready-on-abort |
| H11 | Negative, malformed, teardown cases not supplied | required-case coverage correct |
| H12 | Stable canonical ordering and digest over reordered semantically identical input | determinism without identity collision |
| H13 | Secret-like content, Unicode/path traversal, symlink/junction, repeated huge JSON | redaction, no escape, strict caps |
| H14 | Incorrect or insufficient artifact rights and local-operator absence | no new inspect or mutation authority |
| H15 | Old 79-tool schema vs proposed 80-tool surface and client 128 KiB budget | descriptor + capability routing compatibility |
| H16 | Learning/Mem persistence and telemetry under all negative gates | zero unauthorized durable side effects |
| H17 | Read-only installed-runtime external controller call on separately approved fixture | actual tool availability distinct from compiled source |
| H18 | Explicit realistic approved target case with rights provenance and user signoff | ONLY this can establish bounded authorized-target utility |

Gate H01–H16 should be performed in isolated fixtures after **separate test/build approval**, with exact exit code and output digests; H17 requires separate runtime activation approval; H18 requires separately scoped target inspection approval. Tests present in donor were **inspected as source but not executed**. This document makes zero PASS claims for H01–H18.

## 8. Implementation order, evidence handoff and stopping rules
**Phase 0 — Freeze and feasibility:** confirm Git baseline, existing installed descriptor, artifact receipt owner and path/capability policy. Read-only audit, no install. Stop if new public schema cannot fit and no approved alternative.
**Phase 1 — Design authority contract:** write strict DTOs, evidence/claim/proof status semantics, receipt binding and redaction budgets. Reject undocumented authority upgrade.
**Phase 2 — Implement minimal native evaluator:** port *mechanism* for required cases, typed authority, dependency closure and contradiction; use existing evidence/hash primitives; no REA binary/session library.
**Phase 3 — Targeted verification:** satisfy H01–H16 on fixture and compiled candidate. Record PASS/FAIL/SKIP/UNKNOWN separately; do not label unexecuted checks PASS. Revise hypothesis rather than blind retry.
**Phase 4 — Public facade if feasible:** one tool registered through existing MCP server after host schema budget and strict capability classification; update same-app plugin manifest only with explicit upload authorization; no new app/plugin.
**Phase 5 — Resident activation and proof:** authorized backup/CAS/cutover/restart, fresh tool list, host-bound readback, external use on an explicitly approved target. Sync CODEBASE, plan, current local Memory and changeset only after independently observed results and user-authorized scope.
**Rollback:** restore exact old compiled artifact and schema hashes; preserve log evidence. Reject partial upgrades mixing old host gate and new tool schema. Avoid touching donor checkout.

Stop conditions: live target rights not supplied; read-only receipts cannot be authenticated; host descriptor too large; output limited/truncated in a way that would falsely claim completeness; unknown cannot be represented; or full REA runtime becomes an implicit dependency. In those cases return an exact blocker and a narrower alternative.

## 9. Audit proof, limits and final disposition (as of this study)
**Verified direct observations:** protected REA clone exists, Git HEAD above, donor tracked file census, real entrypoints/call path, read-only representative source and test contracts; native Agent Core artifact_inspect/evidence/learning/code owners and v0.15.0-beta.3 package identity. Existing Grafel workspace was queried read-only and reports current source index; it was used as a secondary lens, not proof of unseen donor execution.
**Historical evidence only:** Cortex and Batch13 report a prior REA source adaptation, installed artifact_inspect facade, and earlier 79-tool / 131,025-byte manifest. New donor HEAD differs substantially from that historical pin; historical test and deployment successes do not validate new donor functionality.
**Unobserved:** donor test execution and pass rates today; compile/build of a proposed harness; fresh descriptor byte calculation; valid real external artifact rights/permit; REA target parser output; real runtime replay; network/OS sandbox isolation of worker threads; cross-version migration behavior.
**Unchanged:** donor protected checkout, Agent Core source, runtime, memory index, provider setup, existing tools, Git metadata and deployment. This task only creates this Markdown study/proposal. No delegation to Codex/other agents, no Qdrant installation/search migration, no Cortex write.
**Decision:** retain REA clone as a pinned, protected donor reference for Phase 1 review. Do not delete or modify it. Do not begin implementation until the user approves this specific scope and any separate execution/test/activation boundaries.

### Primary source map (all relative to respective repository roots)
**REA donor:** package.json; LICENSE; THIRD_PARTY_NOTICES.md; src/main.ts; src/server/createServer.ts; src/server/registerInvestigationTools.ts; src/application/ReconstructionObligationLedgerService.ts; ReconstructionObligationLedgerEvaluation.ts; ReconstructionObligationAuthority.ts; investigation/EvidenceLedger.ts; src/domain/evidenceBundle.ts; reconstructionVerification.ts; reconstructionObligationLedgerSchemas.ts; reconstructionObligationLedgerIntegrity.ts; reconstructionReadiness.ts; reconstructionReadinessIntegrityFindings.ts; src/application/javascript/JavaScriptArtifactAnalysis.ts; ReferenceSourceImportEntries.ts; binary/AnalysisProviderRegistry.ts; RegularFileRead.ts; BrowserObservationService.ts; WebRuntimeService.ts; wasm/WasmArtifactService.ts.
**Donor test source inspected:** src/application/ReconstructionObligationLedger.authority.test.ts; ReconstructionObligationLedger.closure.test.ts; src/domain/reconstructionReadiness.test.ts; reconstructionVerification.test.ts. These are *assertions in source*, not current-run PASS receipts.
**Agent Core:** src/artifact-analysis/{contracts,service,worker}.ts; src/auth/artifact-authorization.ts; src/mcp/artifact-inspect-tools.ts; src/verification/{evidence-snapshot,evidence-links}.ts; src/learning/{effect-evidence,workflow-evidence,decision-evidence}.ts; src/workflows/analyzer.ts; src/agent-knowledge-synthesis.ts; src/agent-capability-catalog.ts; docs/Batch13-Hooks-REA-Windows-Implementation-20261015.md; docs/CODEBASE.md.


## 10. Approved native execution and evidence — 2026-10-17 (supersedes initial proposal status)

**Historical status before §11 activation:** SOURCE IMPLEMENTED — TARGETED VERIFIED — COMPILED NATIVE TOOL ACCEPTED — RESIDENT ACTIVATION THEN PENDING — EXTERNAL MCP UNREGISTERED. The current resident process evidence is recorded in §11; direct hosted native harness invocation and real target behavior remain unexercised.

### 10.1 Source changes and exact ownership
- New src/harness/reconstruction/contracts.ts: strict schema, 256 KiB input, max 32 claims / 64 obligations / 128 receipts / 8 edges, typed required cases and authority.
- New src/harness/reconstruction/receipt-adapter.ts: uses the existing Activity Tracker tool terminal owner; verifies exact native task/process or external owner/task/workspace/identity/attribution. No caller-supplied verifier status grants authority.
- New src/harness/reconstruction/obligations.ts: explicit required positive/negative/malformed/cancellation/teardown cases, missing and cyclic dependencies, owner mismatch, stronger authority refusal and contradiction downgrade. Never upgrades a tool success into semantic proof.
- New src/harness/reconstruction/readiness.ts: deterministic scoped digest, declared-obligations-only READY/OPEN/FAILED/UNKNOWN, 64 KiB output ceiling, explicit omitted rows and no automatic approval.
- New src/harness/reconstruction/service.ts: cancellation-aware pure evaluation, no target IO.
- New src/mcp/reconstruction-harness-tools.ts: read-only native-only reconstruction_harness preview/assess/readiness tool. src/mcp/server.ts registers it ONLY if nativeTaskId and nativeWorkspace are already host-provided.
- src/agent-capability-catalog.ts and src/capability-awareness.ts classify actual native usage and do not classify exposure as use.
- Existing artifact_inspect, local permit, worker ownership, Memory/Learning, Grafel and authorization owners were not modified. REA donor full server, binary session, model, binaries and provider fleet were NOT imported.

### 10.2 Targeted observations, including correction
| Evidence gate | Observed result | Qualification |
|---|---|---|
| First native test run | 21 PASS, 1 FAIL | Empty obligation list was rejected before it could report missing required obligations |
| Scoped correction | Parser allows empty obligation list; declared missing required obligation remains UNKNOWN | No proof-validation loosening |
| After correction | 22/22 tests PASS | Isolated evaluator, synthetic trusted-receipt fixtures |
| Canonical ordering extension | 23/23 tests PASS | Reordered required cases produce deterministic identity |
| TypeScript compile | Exit 0, no reported diagnostics | Compiled candidate, not resident activation |
| Path policy | PASS: 425 authored files, 0 exceptions | Existing checker, no new dependency |
| Compiled native in-memory MCP tool | PASS: preview returned unknown, isError=false, algorithm agent-core-rea-harness/v1 | Compiled tool wiring, not user task E2E |
| Real host receipt in compiled native session | PASS: actual `read_file` on Agent Core package.json → Activity Tracker `tool-call` → native harness `assess` status `ready`, `reason=TOOL_TERMINAL_SUCCESS`, `directMatched=1`, `instanceDigestMatched=true` | Qualifies **tool-completion claim only**, not proof of correctness of the file contents, binary behavior or resident activation |
| Post-correction targeted negative regression | **24/24 PASS**, exit 0 | New case verifies forged or missing host instance digest cannot be substituted by a plaintext session ID |
| Basic public registration | 76 tools / 124,297 bytes, harness absent | Intentional no change |
| Native registration | 75 tools / 122,490 bytes, harness present | Native-only |
| Full external registration | 79 tools / 130,803 bytes, harness absent | Only 269 bytes of 131,072 remain |
| release-compat manifest-only | stale=false, exit 0 | Reviewed base cohort only |

The first npm CLI direct invocation failed because node_modules/npm/bin/npm-cli.js was missing. Instead the existing portable Node executed the same path checker plus TypeScript compiler successfully. No npm package was installed. No claim of npm run build success.

The realistic compiled-native test initially returned `unknown` even though the actual native `read_file` was successful. Root cause confirmed from source and the tracked terminal record: `ActivityTracker` redacts sensitive key `processSessionId` to `[REDACTED]`, so comparing that plaintext identity is incorrect. The existing trusted invocation owner also emits `processInstanceDigest = sha256(processSessionId)` as nonsensitive host evidence. `receipt-adapter.ts` now checks that exact digest for native cases while retaining task scope and freshness. The new negative test rejects missing or forged digest even when caller supplies a plausible raw processSessionId. Final 24/24 PASS and compiled native real-receipt readback PASS. This is task-local verified correction, not permission to lower any security/authorization boundary.

The original H01–H18 matrix is NOT blanket-PASS. The 24 tests are targeted cases of H01/H02/H03/H05/H06/H07/H08/H09/H10 cancellation signal/H11/H12/H13/H14 scope/H16 nonpersistence. Real same-byte-size file change, OS worker kill/late close, live authorization rejection, all telemetry negative paths, external H17 and real-target H18 were not exercised.

### 10.3 Critical proof and security boundaries
- A native host-owned terminal result may support ONLY a declared tool-completion positive case. It cannot certify source meaning, result correctness, binary equivalence, user goals, non-run negative cases, source hash claims or stronger verifier authorities.
- Scope is declared obligations only; a caller-reported complete inventory is NOT proof of complete artifact coverage.
- Activity Tracker evidence is host-owned metadata, NOT cryptographically signed. Missing, duplicated, stale and cross-task receipts remain unavailable.
- Unverified or unknown always remain distinct from verified. No generic queue, second evidence store, provider fleet, agent loop, target execution or automatic Memory/Cortex/Qdrant persistence was added.

### 10.4 Remaining authorized boundaries
1. Compiled candidate is available only for native task-bound Agent Core tool sessions. The currently running Node Core was not restarted or checked for post-build resident activation.
2. External plugin tool remains unregistered. The full 79-tool descriptor has only 269 bytes headroom; public exposure requires an explicitly approved compatible manifest-budget redesign and separate same-app plugin upload permission.
3. Real target use requires a specifically approved target, rights/evidence reference and host permit, not inherited from repo clone.
4. No release:apply, version bump, commit, tag, push, upload or deploy was performed.
5. Scoped rollback removes new source modules and the two native registration/catalog changes, not unrelated dirty Agent Core files.

**Protected donor remains read-only:** morluto/rea at Git HEAD 79d2b718963b28d5b5ce42cda67db648827a9a23. Git status readback was empty (clean). This section is the current implementation authority over historical proposal-only wording above.

**Continuity readback:** canonical local Agent Core Memory record `478f49d8-ab86-46c1-972c-b4a6be0efb24` was **updated in place** with the final 24/24 result, host digest correction and READY-only-for-tool-completion compiled smoke; subsequent `memory_search` returned its exact updated content and `memory_status` showed canonical/index/embedding/intelligence available, `issueCount=0`, 218 notes. `docs/CODEBASE.md` top section records the same status. Supplemental Cortex compact metadata was confirmed saved at `ca713d8d-1123-44bc-add4-165d271b873e`, but Agent Core canonical local Memory remains the architecture authority. `git diff --check` passed for the touched tracked files (Windows LF/CRLF conversion warnings only); donor stayed clean. Local HTTP `/health` was `ok`, source version `0.15.0-beta.3`, Memory and Learning available; this does not prove new harness resident because no Node restart occurred.


## 11. User-approved resident activation — 2026-10-17 (supersedes pending status in §10)

**Activation result:** RESIDENT NEW BUILD LOADED AND HEALTHY; hosted Native Agent task/tool call **NOT YET EXERCISED**, external connector tool **NOT REGISTERED**. The user first asked for the two required file reads; the actual activation turn read canonical runtime/memory/00-agent-core-memory.md first and AGENTS.md second, then relevant CODEBASE, source, preflight, and runtime. Previous implementation had not consistently read AGENTS.md second; that correction is explicit, not rewritten history.

**Preflight facts:** existing launcher PID 21800 and Node PID 9168 started at 14:31 WIB; compiled candidate dist/index.js, dist/mcp/server.js, dist/mcp/reconstruction-harness-tools.js, dist/harness/reconstruction/receipt-adapter.js modified at 2026-10-17 08:38:58 UTC (15:38:58 WIB), after the old processes started. Existing task AgentCore-Restart-Manual-937A8AE664969FF8 matched current user SID, exactly one fixed PowerShell task action, zero scheduled triggers, and was Ready; -Mode Run -WhatIf exited 0 without mutation. /health was already ok with Memory and Learning available. External Remote Desktop Commander registered devices were offline; the already installed local Task Scheduler activation route was used instead.

**Actual execution:** the Invoke-Agent-Core-Restart.ps1 -Mode Run request caused an Agent Core tool transport internal failure/disconnection as the original core exited. **Do not infer failure or success from this interrupted tool call.** Subsequent independent readback found TWO distinct newly written on-demand task receipts:
- runtime/restart/80b0285376714e19ae09bc04e4d024d9.json: completed 08:55:09 UTC, exitCode 0, error null. Its associated log records closing launcher PID 21800 and opening PID 9412.
- runtime/restart/66824eb0df9944399d2e0821e42dd9da.json: completed 08:57:04 UTC, exitCode 0, error null. Its associated log records closing PID 9412 and opening PID 21684.
The second request's initiator/cause is **UNRESOLVED**. The actual result is **two successful restarts**, not one. After reading these receipts, no further restart or blind replay was sent.

**Current resident evidence:** final Agent Core launcher PID 21684 created at 15:57:02 WIB, project-owned Node PID 13964 at 15:57:06 WIB, tunnel PID 21776 at 15:57:21 WIB; all after the 15:38:58 WIB emitted build. Independently inspected Node process exact executable runtime/node/node.exe and command entry dist/index.js; build dist/index.js imports dist/mcp/server.js, which imports dist/mcp/reconstruction-harness-tools.js. Health endpoint responded status=ok, version=0.15.0-beta.3, canonical Memory available, Learning available, native agentRuntime available and agentChat available with zero running turns. Native Memory status returned canonicalComplete=true, index/embedding/intelligence available, 218 notes and issueCount=0. These establish resident process/new-build import path and service health; **they do not establish a direct live hosted-native invocation of reconstruction_harness**. No real external REA target was inspected.

**Capability boundary preserved:** construction of native task-bound MCP servers conditionally registers reconstruction_harness; compiled in-memory native session previously demonstrated genuine host tool receipt to READY for tool completion (24/24 targeted regression PASS). The active ChatGPT external MCP adapter still does not advertise reconstruction_harness; the old full external descriptor measured 79 tools/130803 bytes under 131072, so no ZIP upload or schema expansion. No source/rights/permissions/canonical Memory engine changes, credential operations, toolchain installation, Git commit/push/release or second app.

**Continuity verified:** docs/CODEBASE.md includes this exact chronology. The original canonical local Memory record `478f49d8-ab86-46c1-972c-b4a6be0efb24` was updated **in place** with resident start/health, both restart receipts, and the direct-hosted-native-tool qualification gap. `memory_search` returned the new complete 4,432-character content with current metadata. Existing runtime/restart receipts/logs are the independently inspectable machine evidence; the second restart trigger's cause remains unknown, not a verified recovery lesson. Learning continuity: after restart, the previously host-issued explicit external task ext-402b9f5765a549198d7edd17859b991a was reselected by its existing stable taskKey (no duplicate episode). Learning checkpointCount 408, key rea-harness-resident-activation-20261017-readback, had verified receipt paths as evidenceRefs; the exact-key review completed status=no-new-knowledge with zero new candidates and external episode linkage recorded. This does not certify a direct hosted native harness call or retire unrelated pending reviews.
