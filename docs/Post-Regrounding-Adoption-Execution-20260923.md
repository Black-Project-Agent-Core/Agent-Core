# Post-Regrounding Adoption Execution — 2026-09-23

> **Status:** IMPLEMENTATION QUALIFIED — LIVE/OPERATIONAL CLOSURE COMPLETED 2026-09-24 WHERE APPLICABLE. Current closure: `docs/Six-Plan-Activation-20260924.md`.
> **Approved scope:** ASI-P5, SL-P2, S8-P1, RF-P2. SecondSight remains retired with no new implementation.
> **Product version during work:** 0.12.0.
> **Historical runtime boundary:** this 2026-09-23 implementation task did not restart Core or cut over active dist; the later authorized cutover/restart is recorded separately in `docs/Six-Plan-Activation-20260924.md`.

## Implemented scope

| Proposal | Native owner | Result |
| --- | --- | --- |
| ASI-P5 | `src/learning/retrieval-series.ts` | Optional evaluator-role identity, independence evidence and bounded reliability evidence are represented in offline series reports. Legacy manifests remain valid and unknown evidence remains explicit. |
| SL-P2 | `scripts/inspect/workspace-fingerprint.mjs` | Explicit read-only Git workspace fingerprint over HEAD/status/tracked-diff hashes, with bounded untracked path evidence and before/after comparison. No untracked contents are read. |
| S8-P1 | C# adapter + `LanguageServerSession` | After successful LSP initialize/initialized, bounded metadata discovery may emit `solution/open` and `project/open`. Health evidence distinguishes complete from partial scans. |
| RF-P2 | `scripts/release/candidate-cutover.mjs` | Candidate install requires candidate hash + expected-active CAS preflight, scoped backup, readback verification and rollback of changed artifacts on failure. |

SecondSight has no residual proposal. Its deleted reference is not recreated.

## Truth boundaries

- ASI-P5 is reporting-only: no evaluator/model is launched and labels alone do not prove independence.
- SL-P2 is evidence-only: no stash/reset/checkout/commit/hook/governor behavior and no causal attribution claim.
- S8-P1 never runs restore/MSBuild and cannot repair a provider that fails before initialize succeeds.
- RF-P2 does not restart Core/providers, apply a release, change versions or authorize deployment.
- Historical task boundary: active `dist` was not replaced during this 2026-09-23 implementation task. ASI-P5/S8-P1 were source + isolated-candidate verified at that time; their later live activation is recorded in `docs/Six-Plan-Activation-20260924.md`.
## Verification

### Source-targeted matrix
Seven files / **45 tests PASS, 0 FAIL**:
- retrieval-series policy;
- workspace fingerprint;
- C# post-initialize project open;
- readiness evidence;
- protocol hardening;
- terminal transport lifecycle;
- candidate cutover CAS/rollback.

### Isolated learning candidate
`runtime/build/post-regrounding-adoption-20260923` was compiled from the selected Learning + Semantic IDE source with TypeScript **exit 0**.
With `AGENT_CORE_TEST_CLI_ROOT` and `AGENT_CORE_TEST_DIST` bound to that candidate:
- retrieval series + analysis CLI: **27/27 PASS**.

### Compiled Semantic IDE candidate
A direct compiled-candidate smoke observed:
`initialize -> initialized -> solution/open -> project/open`
with:
- `complete=true`;
- `truncated=false`;
- `ioIssueCount=0`;
- ignored project metadata excluded;
- one selected solution and one selected project.

### SL-P2 operational evidence
- Focused fixtures: **3/3 PASS** including clean/staged/untracked, no-HEAD, multi-repo aggregation, protected-root rejection and comparison.
- Explicit CLI fixture produced a version-1 fingerprint without reading untracked contents.
- Running against the real Agent Core repo failed closed because the existing Git object database cannot read object `1ebc8cc1555ca665271f96ef179fa6d1b7aef5c8`.
- Git status digest before/after that failed call was identical, so the attempt did not mutate repository state.

### RF-P2 operational evidence
**4/4 PASS**:
- positive declared-artifact install;
- stale active/candidate hash refusal before write;
- expected-absent collision + mid-preflight replacement refusal;
- injected installation failure with exact rollback verification.

No dependency installation was required.
## Evidence and backup

- Backup before product edits:
  `runtime/backups/post-regrounding-adoption-20260923/`
- Candidate:
  `runtime/build/post-regrounding-adoption-20260923/`
- Evidence:
  `runtime/tmp/post-regrounding-adoption-20260923/`
- Change intent:
  `.changeset/20260923-post-regrounding-adoption.md`

## Historical activation state at end of the 2026-09-23 task

- **ASI-P5:** source + isolated candidate verified; active retrieval-report dist remains a separate cutover.
- **SL-P2:** source CLI implemented and directly invokable; no runtime service activation exists or is required.
- **S8-P1:** source + isolated compiled candidate verified; Node Core activation is still separate.
- **RF-P2:** source CLI/helper implemented and targeted verified; it is a future explicit cutover primitive, not itself an activation of current candidates.
- **SecondSight:** remains retired/deleted; no open residual task.

No `release:apply`, version bump, commit, tag, push, publish, deploy or restart was executed.
