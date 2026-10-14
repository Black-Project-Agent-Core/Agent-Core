# Four-Reference Residual Adoption Execution — 2026-09-25

## Scope
Approved implementation/qualification of ASI-P6, SL-P3, S9-P1 and RF-P3 from the retained Awesome Self-Improving Agents, Shiploop, Serena/SolidLSP and Reef references.

## Result
- ASI-P6: implemented in current source; bounded mechanism attribution remains evidence-only and never claims causality.
- SL-P3: implemented as an explicit Node CLI. Qualification exposed and fixed a real stdout/stderr tail-ordering defect so bounded failure output preserves stderr and the exact child result.
- S9-P1: implemented as a TypeScript definition/declaration-only safe project-local dependency fallback. Global node_modules ignore and mutation/freshness boundaries remain unchanged.
- RF-P3: implemented through bounded Learning effectEvidence, public MCP schema exposure, proposal-only handling for unobserved behavior, and digest-only decision telemetry.
- No additional dependency/toolchain installation was required.

## Verification
- Selected current-source TypeScript staging compile: exit 0.
- Source-targeted matrix: 7 files / 64 PASS / 0 FAIL / 2 host-fixture SKIP.
- Compiled ASI series + analysis CLI candidate: 2 files / 31 PASS / 0 FAIL.
- SL-P3 focused acceptance: 5/5 PASS.
- RF-P3 focused acceptance: 7/7 PASS.
- S9-P1 dedicated definition fallback cases: 3/3 PASS.
- Structural Grafel review: current graph; impact bounded to Agent Core module and SemanticIdeService/initialize neighborhood.
- release:compat: ok=true, current MCP tool count 62, no removed tool, breakingEvidence=false. Its baseline comparison is degraded because the current-line baseline ref is absent; manifest is reported stale relative to source.
- release:check-intent: unavailable/exit 2 because refs/agent-core/current-line-baseline does not exist. This task does not create or refresh that baseline.

## Activation boundary
Active dist does not yet match the qualified candidate for ASI-P6, S9-P1 and RF-P3. Active dist also lacks learning/effect-evidence.js. Resident cutover/restart remains separately authorized. SL-P3 is an explicit source CLI and requires no resident activation.

## Evidence
- Candidate: runtime/build/four-residual-20260925-1500/
- Machine-readable result: runtime/tmp/four-reference-residual-adoption-20260925/result.json
- Backup: runtime/backups/wave-asi6-sl3-s9-rf3-20260925-1500/
- Release intent: .changeset/20260925-four-reference-residual-adoption.md

No release apply, version bump, restart, provider cutover, commit, tag, push, publish or deploy was performed.

## Installed activation + reference retirement closure

**COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.**

RF-P2 expected-active CAS installed exactly 12 qualified artifacts: ASI-P6 retrieval-series JS/map, RF-P3 effect-evidence/review/decision-evidence/Learning-schema JS/maps, and S9-P1 Semantic IDE service JS/map. Candidate and expected-active hashes were rechecked before write; readback is **12/12 hash matches**, rollback was not required.

The owned Core lifecycle restarted only the listener whose command line matched `E:\Projects\Agent-Core\dist\index.js`: PID **14360 → 14012**. Fresh `/health` is `ok`, version remains **0.12.0**; Memory, Code Intelligence/current graph, Semantic IDE and Learning are available with zero issues. Hermes remains separately degraded with `HERMES_HOME_NOT_FOUND`.

Installed-runtime acceptance:
- ASI-P6 active `dist` series + real analysis CLI: **31/31 PASS**.
- S9-P1 active `dist/semantic-ide/service.js`: **3/3 PASS**.
- RF-P3 active Learning modules/schema: **7/7 PASS** plus direct active-schema parsing of `effectEvidence`.
- SL-P3: no resident activation required; its explicit source CLI remains **5/5 PASS**.

Vitest emitted sourcemap source-path warnings while loading active `dist`. Backup pre-activation maps contain the same relative source paths, so this is a pre-existing source-map condition, not introduced or repaired by this activation.

Final reference census retained **awesome-Self-Improving-Agents** because its 185 external repository discovery links remain independently unaudited; local ASI-P6 work is nevertheless closed. Shiploop, numbered Serena and Reef had no remaining current-fit residual and passed exact-pin, Git-clean, zero-reparse, zero-process, zero `src/scripts/tests` dependency, and zero Grafel-registration safety checks. Their tracked hashes and provenance were preserved before deletion. Those three checkouts were deleted and read back absent.

License/provenance continuity is retained in root `THIRD_PARTY_NOTICES.md`: SolidLSP MIT was already present; Shiploop NOTICE and Apache-2.0 attribution plus Reef Apache-2.0 attribution/license terms were added before checkout retirement.

Activation evidence:
- `runtime/tmp/four-residual-activation-20260925/cutover-result.json`
- `runtime/tmp/four-residual-activation-20260925/restart-result.json`
- `runtime/tmp/four-residual-activation-20260925/activation-closure.json`
- `runtime/tmp/four-residual-activation-20260925/final-reference-predelete.json`
- `runtime/tmp/four-residual-activation-20260925/final-reference-retirement.json`
- backup: `runtime/backups/four-residual-activation-20260925/`

No `release:apply`, version bump, commit, tag, push, publish or deploy was performed. The existing release-baseline absence remains a separate release-tooling state and was not repaired by this activation.
