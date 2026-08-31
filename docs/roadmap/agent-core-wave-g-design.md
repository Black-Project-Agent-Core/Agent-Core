# Agent Core Wave G — Core Re-Certification Design

## Purpose

Wave G is the final consolidation wave from `docs/roadmap/agent-core-balanced-evolution.md`.
Its job is **not** to add another runtime subsystem. Its job is to prove that the evolved
Agent Core behaves as one coherent stable local control plane after Waves A–F.

The operator-approved stable release target for this final wave is **Agent Core v0.6.0**. Presentation Bridge keeps its independent version.

Wave G may change runtime behavior only if certification exposes a concrete defect. A
refactor without an operational defect is out of scope.

## Starting point

Wave G starts from current `origin/main`:

```text
00ced56815b126433d3398e649656428159ecbef
```

The only commit after the Wave F closeout modifies Super-Runtime documentation and does
not touch Agent Core core implementation or tests.

Fresh Wave G baseline on this source:

```text
npm ci                         PASS
npm run verify:release         PASS
normal test files              136 PASS / 2 skipped
normal tests                   663 PASS / 38 intentional skips
Wave E routing/memory gate     PASS
stable release parity v0.5.4   PASS
```

## Non-negotiable constraints

1. Codespace is the only execution/integration environment for this wave; do not use the Mac Agent Core runtime.
2. No external AI model, model API, cloud reasoning worker, embedding API, reranker, AI judge, or hidden multi-agent dependency may be added.
3. GitHub Actions/CI is not the release authority. Certification is executed locally from Agent Core in Codespace.
4. Existing 55-tool MCP surface remains unchanged unless a verified defect requires otherwise.
5. Existing legacy `2025-11-25` and modern `2026-07-28` protocol support remains unchanged.
6. No destructive autonomous maintenance is introduced.
7. No architecture-level stable claim may be made until the Wave G matrix and live runtime checks pass on the exact published source.
8. Concurrent main work must be reconciled explicitly; never reset or overwrite unrelated work.
9. Every publication uses non-force push plus fetch/readback SHA equality.
10. The remote Wave G branch is retained for audit after local cleanup.

## Verified gap Wave G closes

The repository already has evidence for every Wave G matrix area, but the evidence is
spread across release verification, normal tests, quality gates, performance scripts,
stable-release parity, and live runtime canaries. There is no single repository-owned
command that defines what "core certified" means.

That is a release-process gap: a future operator could run only `npm test`, only
`verify:release`, or only a benchmark and make an incomplete architecture-level claim.

Wave G closes this by adding a deterministic **core certification contract** and one
canonical command:

```text
npm run certify:core
```

The command is the local technical gate. Public Codespace runtime canaries remain a
separate environment gate because they need the currently published/forwarded runtime,
not an isolated test fixture.

## Final certification matrix

The exact roadmap matrix is preserved:

| ID | Area | Primary repository evidence |
|---|---|---|
| `authentication_oauth` | Authentication / OAuth | `tests/oauth.test.ts`, `tests/http-auth.test.ts`, `tests/http-security.test.ts` |
| `mcp_legacy_compatibility` | MCP legacy compatibility | `tests/mcp-dual-era.test.ts`, `tests/mcp-integration.test.ts` |
| `mcp_modern_compatibility` | MCP modern compatibility | `tests/mcp-dual-era.test.ts`, `tests/mcp-sdk-v2-contract.test.ts` |
| `principal_isolation` | Principal isolation | `tests/mcp-route-enforcement.test.ts`, `tests/route-context-store.test.ts`, `tests/memory-quality.test.ts` |
| `project_isolation` | Project isolation | `tests/project-scope-routing.test.ts`, `tests/memory-operational-audit.test.ts` |
| `operational_audit_isolation` | Operational audit isolation | `tests/memory-operational-audit.test.ts`, `tests/routing-audit.test.ts` |
| `dmf_integrity_quality` | DMF integrity + quality | `tests/memory-quality.test.ts`, `tests/memory-recovery.test.ts`, `tests/quality-gate.test.ts` |
| `continuity` | Continuity | `tests/continuity-resume.acceptance.test.ts`, `tests/continuity-checkpoint.test.ts` |
| `execution_durability` | Execution durability | `tests/execution-recovery.test.ts`, `tests/execution-runner.test.ts`, `tests/execution-restart-artifact.acceptance.test.ts` |
| `execution_policy_resource_control` | Execution policy/resource control | `tests/execution-policy.test.ts`, `tests/resource-governance.acceptance.test.ts`, `tests/resource-governance-matrix.test.ts` |
| `backup_restore` | Backup/restore | `tests/execution-backup-restore.test.ts`, `tests/memory-recovery.test.ts` |
| `evidence_retention` | Evidence retention | `tests/execution-retention.test.ts` |
| `audit_integrity` | Audit integrity | `tests/audit-journal.test.ts`, `tests/audit-rotation.test.ts` |
| `observability` | Observability | `tests/health-metrics.test.ts`, `tests/observability-correlation.integration.test.ts`, `tests/otlp-exporter.test.ts` |
| `github_fabric_regression` | GitHub Fabric regression | `tests/github-mcp.test.ts`, `tests/github-api.test.ts`, `tests/github-git.test.ts`, `tests/github-secret-leakage.test.ts` |
| `release_parity` | Release parity | `tests/release-package.test.ts`, `scripts/release/check-release.mjs`, `scripts/release/check-stable-parity.mjs` |
| `performance` | Performance | `scripts/benchmark-memory.mjs`, `scripts/benchmark-execution.mjs`, performance tests |
| `no_external_ai_model_api_dependency` | No external AI model/API dependency | package/source policy scan in the Wave G certification checker |

## Certification contract

Create `scripts/release/core-certification-contract.mjs` as data-only policy. It owns:

- schema version;
- exact 18 matrix entries;
- evidence paths for each entry;
- required certification scripts;
- forbidden dependency-name patterns for external AI/model/vector-agent SDKs;
- forbidden core-source endpoint/API-key markers for external model services;
- the file scopes that constitute Agent Core core for that policy scan.

Create `scripts/release/check-core-certification.mjs` as a fast deterministic checker.
It must:

1. prove all 18 matrix entries are present exactly once;
2. prove every evidence path exists and is tracked;
3. prove required package scripts exist;
4. run `git diff --check`;
5. inspect root and Codespace plugin dependency manifests for forbidden model/agent SDK names;
6. inspect tracked Agent Core core source/scripts for forbidden external model endpoint/API-key markers;
7. emit a bounded JSON contract report with source SHA and no secret values.

This checker proves that the certification *contract* is intact. It does not replace the
actual test/benchmark commands.

## Canonical technical command

Create `scripts/release/certify-core.mjs` and package scripts:

```text
npm run certify:core:prepublish   # source gate before v0.6.0 exists remotely
npm run certify:core              # postpublish gate including stable v0.6.0 parity
```

The prepublish orchestrator runs gates 1-4 below. The postpublish orchestrator runs all five:

```text
1. node scripts/release/check-core-certification.mjs
2. npm run verify:release
3. node scripts/benchmark-memory.mjs --count=100000 --samples=5 --warmup=2 --target-p95-ms=150
4. node scripts/benchmark-execution.mjs --samples=20 --warmup=3
5. node scripts/release/check-stable-parity.mjs   # postpublish only
```

`verify:release` already runs build, plugin build, full normal tests, Wave E quality gate,
release metadata checks, and documentation-link checks. Therefore the benchmark scripts
can consume the freshly built `dist` without rebuilding again inside the orchestrator.

The orchestrator emits a final bounded JSON report only after every command exits zero.
Required report facts:

```text
schema
sourceCommit
version
matrixCount = 18
releaseVerification = pass
memoryRecall100k observedP95/target/pass
execution DAG/dispatch/wake p95 and concurrency bound
stable release tag/commit
external AI/model/API dependency violations = 0
ok = true
```

No credentials, raw GitHub token, raw execution logs, audit hashes beyond already-safe
bounded prefixes, principal IDs, task content, or memory content may be included.

## Performance gates

Wave G retains existing quantitative gates rather than inventing new thresholds:

```text
100k memory preflight p95     < 150 ms
128-node DAG p95              < 50 ms
ready dispatch p95            < 100 ms
persisted wake p95            < 250 ms
max observed execution        <= configured maxConcurrency
```

The final report records exact observed values from the Wave G run.

## GitHub Fabric certification

`certify:core` uses normal GitHub regression tests plus `verify:stable-parity` as the
canonical repeatable gate. In the final Codespace certification run, perform one extra
read-only live GitHub acceptance if the Codespace GitHub credential can be materialized
without exposing it:

```text
GET /user
repository GET
Git ls-remote HEAD/default branch
npm package list
```

A missing optional Packages scope is reported factually; it must not be disguised as a
successful live acceptance. This supplemental probe never mutates GitHub.

## Public runtime/environment gate

After publication and controlled Codespace source-sync, verify the exact published SHA:

```text
HEAD == origin/main == connection.sourceCommit
/health                                  200
remote /health/metrics                   403
local /health/metrics                    200
/mcp without token                       401
evil Origin                              403
correlation headers                      present
memory integrity                         ok
execution integrity                      ok
resource safeConcurrency                 <= operator max
maintenance default                      disabled
legacy MCP                               2025-11-25 / 55 tools
modern MCP                               2026-07-28 / 55 tools
audit journal verify                     PASS
```

A temporary public canary key, if created, must be revoked and its revocation verified.

## Architecture-level stable claim

Only when all of these are true may Wave G state the new architecture-level claim:

```text
npm run certify:core                      PASS
18 / 18 core matrix areas                 PASS
published main/source/runtime equality    PASS
public trust-boundary canary              PASS
legacy + modern MCP canary                PASS
live audit verification                   PASS
external AI/model/API dependency          0
```

The stable claim applies to the Agent Core control-plane architecture at the exact
certified source SHA. It does not imply that every experimental subproject under
`SubProject/` is production-stable.
