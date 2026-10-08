# Agent Core system repair and SIE completion — 23 September 2026

**Historical recovery checkpoint.** The partial-system findings and legacy-repository boundary below record 2026-09-23. Later repair evidence is in [28 September audit repair](history-agent-core/Codebase-Audit-Repair-Plan-20260928.md); the user-confirmed current GitHub source is now [Black-Project-Agent-Core/Agent-Core](https://github.com/Black-Project-Agent-Core/Agent-Core), reviewed at `8a80251` on 2026-10-08 UTC. This correction does not authorize restoring, merging or publishing anything. See [current architecture](CODEBASE.md) before acting on a historical residual.

**Current status: SIE-P1/P2/P3/P4/P5 INSTALLED AND VERIFIED; system-wide recovery PARTIAL with explicit residual issues below.**

The user authorized repair of the previously reported errors and completion of SIE. Current source/runtime is authoritative; the legacy repository is not a restoration source. No release, commit, push, or historical baseline replacement is authorized implicitly.

## Scope and observed baseline

The full TypeScript root initially reported 45 diagnostics, not merely the earlier 29 dependency diagnostics from selected compilation. Twenty-one production TypeScript modules were missing. Runtime JavaScript remained present. The canonical foundation was readable, but the parser accepted NUL/binary and unrelated foundation text. Three managed LSP providers were missing entrypoints. Four release CLI adapters were absent. Git fsck reported missing historical objects. External Hermes home remains missing and is separate from native Learning.

## Historical implementation evidence

- Recovered 15 modules from matching local TypeScript snapshots and reconstructed six later versions from current JavaScript bodies plus retained TypeScript contracts. All 21 match the installed runtime program before new hardening; six are not claimed historical byte-for-byte source recovery.
- Restored the generic JSON-reader type signature without changing its runtime program. Full root TypeScript 7.0.2 no-emit check completed with exit 0 and no diagnostics.
- Repaired Python, C# and PowerShell through the existing pinned project-local provisioner. Real LSP overview calls returned symbols from task-local fixtures for all three; Semantic IDE reports available with zero issues.
- Memory parser hardening passed 11 isolated cases after recording nine negative failures. Production canonical memory was not altered by those tests.
- Release adapters/filter changes and exact-hash Git object recovery remain under verification.

## SIE-P2/P5 consumer and verification protocol

The selected consumer is an explicit offline memory-retrieval hit-at-K report command, not an autonomous optimizer. The operator supplies a reviewed immutable query cohort with expected memory IDs and a separate observation artifact containing baseline/candidate ranked IDs. Each fixed query is exactly one opportunity; missing, duplicate, or foreign query IDs invalidate the comparison. The sample minimum is supplied by the cohort, never a universal constant 20.

The scorer validates all hard flags and integer counts before calculating candidate hit rate minus baseline hit rate. A separately implemented verifier rereads the same bytes and independently checks all conditions and the reported result. Reports bind cohort, observation, evaluator and verifier identities with SHA-256. This proves deterministic recomputation of supplied artifacts, not authenticity of the cohort or a measured production quality improvement.

Evidence and backups: `runtime/tmp/system-repair-sie-final-20260923/` and `runtime/backups/system-repair-sie-final-20260923/`. Final source, compiled, installed, and live results will be recorded separately below. No unchecked item is silently declared complete.


## Final resumed verification — 23 September 2026

**SIE-P1/P2/P3/P4/P5: INSTALLED — VERIFIED FOR THE APPROVED SCOPE. System-wide recovery remains PARTIAL.**

The user reconnected Agent Core. The already-installed artifacts were not reinstalled and the Core was not restarted in this resumed task. Current installed hashes were checked before and after verification.

| Check | Observed result |
| --- | --- |
| Installed runtime tests | 284 PASS / 0 FAIL / 0 SKIP across the same 29 selected test files; exit 0. |
| Authenticated live HTTP MCP | 19/19 checks passed, 62 tools, five existing Learning actions; temporary credential revoked. |
| Installed and preserved artifacts | All 339 hashes match the prior activation manifest: 12 selected plus 327 preserved. |
| Changed runtime programs | All six changed JavaScript programs were loaded from installed dist during the test run. |
| Source state | No drift from the source hashes recorded by the prior activation manifest. |
| Full-root TypeScript no-emit | Exit 0, empty diagnostic output. This is a fresh root typecheck, not a new runtime build/release. |
| CLI qualification | The prior installed CLI report and exit record remain readable: 5 cases passed, exit 0. No new CLI qualification is implied. |
| Test disk footprint | 136 remaining fixture files, 73,570 logical bytes at teardown; the session-owned NTFS fixture tree was removed. No full dist copy per worker. |

The old installed-test log explicitly records ENOSPC while JsonReporter wrote its report. Its two zero-byte JSON files remain historical failed-report evidence; they are not treated as a passing run. The new report is nonempty, parsed successfully, and paired with exit status. The earlier live helper inspected `symbols`; the actual LSP payload is `results.items`. The resumed helper checks the expected symbol name and provider in that field, without weakening a product assertion.

P2's passing declaration is controller-attested recomputation, not authentication of arbitrary external artifacts. The offline P5 consumer recomputes supplied hit-at-K cohort/observation evidence and leaves its review candidate unverified until a separate controller review. These results do not assert a production retrieval-quality improvement. Live probes did not persist synthetic claims into canonical Memory or Grafel.

Four missing documentation paths were restored from hash-checked local backups with prominent HISTORICAL banners. The retained payload matches the backup byte-for-byte, but the backup is not claimed to be the newest lost revision: Grafel-Second-Wave-Capability-Integration-Plan.md, Hermes-A2A-Partner-Bridge-Plan.md, Hermes-Self-Learning-Memory-Steal-Use-Plan.md, and Agent-Core-3.md.

### Residual issues — explicitly OPEN

- **Git/history:** fresh fsck exits 58, with 56 missing blobs, 25 trees and 1 commit; current-line-baseline and legacy/main contain invalid pointers. Prior exact-object recovery of 312 blobs/eight trees is not complete history recovery. A healthy matching Git backup/bundle is required; no synthetic replacement baseline or legacy fetch was performed.
- **C#/PowerShell readiness:** all three repaired providers return the expected live symbols, but after activating sessions the health surface reports two SEMANTIC_PROVIDER_READINESS_TIMEOUT issues. A fresh isolated probe reproduces this for C# and PowerShell even though each returns document symbols. Their adapters start in indexing state and wait for notifications not emitted in these observed sessions (standalone Roslyn and statically registered PSES). No source fix, status override, timeout inflation, or further runtime cutover was performed in this verification-only continuation. This is distinct from the repaired missing-entrypoint problem, and it is not marked closed.
- **Hermes external:** configured E:/Projects/hermes remains HERMES_HOME_NOT_FOUND. This does not invalidate native Learning/SIE, and the external deployment was not recreated or silently redirected.
- **Historical artifacts:** Agent-Core-14.md and the lost newest historical revisions/release archive are not recovered. Existing backup snapshots are evidence only, not manufactured current history.
- **Debugger maps:** installed tests emit legacy sourcemap-to-missing-source warnings. The full-root source typecheck succeeds, but those installed map references were not rewritten during this continuation.

The final health readback is Core HTTP 200/ok; Execution, Memory, Learning and Grafel available/current; Memory issueCount 0; tunnel readiness HTTP 200. Semantic IDE is degraded with the two session-readiness issues above, and Hermes Partner remains degraded. Do not infer an entirely error-free system from passing SIE tests.

### Evidence and continuity

Current evidence: runtime/tmp/system-repair-sie-final-20260923/resume-20260923/.
Important files: installed-tests.json, installed-tests.exit.json, installed-provenance.json, live-mcp-verification.json, final-readback.json, readiness-probe.json, process-readback.json, and history-document-restoration.json.
Old candidate/activation evidence and rollback backups remain in their original locations. Current completion state is synchronized into the existing SIE record 2820c59d-9e92-41c5-821a-31da35c8837a and repair record 3994c6ba-89a5-41a6-a995-d87f8d7d7664; the final synchronization readback is recorded separately.

No installer rerun, production source change, dependency installation, OAuth reset, release apply, commit, push or Core restart occurred in this resumed verification. Product version remains 0.12.0. SIE activation/installed verification has no remaining task; the separate OPEN issues above remain real work.
