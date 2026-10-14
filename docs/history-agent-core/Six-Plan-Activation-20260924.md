# Six-Plan Activation Closure — 2026-09-24

> **Status:** COMPLETE — INSTALLED — LIVE-ACTIVATED — TARGETED INSTALLED-RUNTIME VERIFIED.
> **Product version:** 0.12.0 unchanged.
> **Scope:** Awesome/ASI-P1–P5 reporting stack, Shiploop SL-P1/P2, SecondSight SS-P1/P2, Serena S7-P1/S8-P1, Reef RF-P1/RF-P2, and the post-adoption residual ledger.
> **SecondSight reference:** remains retired/deleted; no checkout was recreated.

## Activation method

Current Agent Core source was compiled to `runtime/build/six-plan-current-20260924/dist` with TypeScript exit 0. The older candidate trees were not copied wholesale, because later Wave7/SIE work exists in current source.

Before installation, the focused source matrix passed **47/47**. RF-P2 `candidate-cutover.mjs` then enforced candidate hashes plus expected-active hashes/absence before each write. The first cutover installed 9 JavaScript artifacts; a second CAS cutover installed their 9 sourcemaps after installed testing exposed missing-map warnings.

Backups:
- `runtime/backups/six-plan-cutover-20260924/`
- `runtime/backups/six-plan-sourcemap-cutover-20260924/`
- `runtime/backups/six-plan-finalize-20260924/`

Cutover results:
- `runtime/tmp/six-plan-cutover-result-20260924.json`
- `runtime/tmp/six-plan-sourcemap-cutover-result-20260924.json`

## Live readback

After restart, project-local Node Core is PID **13580**, running `dist/index.js`. `GET /health` returns HTTP 200 / `status=ok`, version **0.12.0**; Memory canonical/index/embedding/intelligence and Execution are available, Memory issueCount is 0.

Installed artifact readback reports **18/18 hashes match** the current-source staging build and no temporary installed-test fixture remains.

Installed-runtime verification:
- ASI retrieval series/profile/portfolio + analysis CLI: **27/27 PASS** with `AGENT_CORE_TEST_DIST` bound to active `dist`.
- Semantic IDE installed modules: **11/11 PASS** across readiness preservation, C# post-initialize solution/project-open, and terminal transport failure.
- SS-P1 live Activity Tracker evidence records `tool-invocation-start` and terminal `tool-call` with the same opaque `invocationId`; `get_config` live produced that pair.
- SL-P2 workspace fingerprint, SS-P2 operation completeness, and RF-P2 candidate cutover are source CLIs/helpers and need no resident service. Their focused tests are included in the 47/47 source matrix; RF-P2 also performed both real CAS cutovers successfully.

## Truth boundaries

The activation itself did not repair unrelated runtime health. At this activation checkpoint Grafel index state was `unknown`, Semantic IDE had one PowerShell provider version-probe issue, and Hermes partner reported `HERMES_HOME_NOT_FOUND`. Grafel and PowerShell were subsequently repaired and live-verified later on 2026-09-24; Hermes remains separate.

S8-P1 runs only after successful C# initialize and is not represented as a repair for historical initialize timeouts. RF-P2 still does not authorize restart, release apply, deployment, or version changes. ASI reporting remains offline/read-only and does not launch evaluators or approve deployments.

No `release:apply`, version bump, commit, tag, push, publish, or deploy was performed.

## Continuity

This ledger supersedes only prior **activation-pending** statements for the selected scope. Historical source/candidate verification checkpoints remain evidence of their time and are not rewritten as if they were live then.

Updated authorities:
- `docs/Awesome-Self-Improving-Agents-Steal-Use-Integration-Plan.md`
- `docs/Shiploop-Steal-Use-Integration-Plan.md`
- `docs/SecondSight-Steal-Use-Integration-Plan.md`
- `docs/Serena-Second-Wave-LSP-Freshness-Multi-Language-Integration-Plan.md`
- `docs/Reef-Steal-Use-Integration-Plan.md`
- `docs/Five-Reference-Post-Adoption-Regrounding-20260923.md`
- `docs/CODEBASE.md`
- canonical Agent Core memory records for the five-plan implementation and post-adoption residual census.


## Subsequent health repair — 2026-09-24

The post-activation Grafel `index=unknown` and PowerShell version-probe degradations were subsequently repaired and live-verified. Current truth is recorded in `docs/Grafel-Semantic-Health-Repair-20260924.md` and `docs/CODEBASE.md` section 0.1.12. Grafel is now `available/current` with live graph evidence; Semantic IDE is `available` with PowerShell `7.6.6` / `compatible`.
