# Agent Core Wave E — Routing & Memory Quality Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use an isolated worktree, execute task-by-task, and apply TDD for every behavior change.

**Goal:** build deterministic offline routing/memory quality evaluation, capture a pre-tuning baseline, then make only evidence-backed local heuristic changes that improve quality without violating security, isolation, determinism, compatibility, or performance gates.

**Architecture:** repo-owned JSON corpora feed deterministic evaluators. Routing evaluation uses a fixed synthetic capability registry; memory evaluation drives the real `MemoryService` against temporary SQLite stores. A unified JSON scorecard supports report mode for baseline capture and gate mode for certification. Tuning is forbidden until the corresponding baseline is recorded.

**Tech Stack:** TypeScript, Node.js 24, Vitest, node:sqlite, existing Agent Core routing/memory services, JSON fixtures, no new runtime dependency.

**Spec:** `docs/roadmap/agent-core-wave-e-design.md`

## Global Constraints

- No external AI model, model API key, cloud embedding, vector SaaS, cloud reranker, or AI judge.
- No new MCP tools; the certified tool surface remains 55.
- Preserve Wave A-D security/compatibility behavior.
- No production heuristic/weight change before a pre-tuning baseline scorecard is captured.
- Routing unsafe overpermission, cross-project memory contamination, cross-principal memory contamination, and hard-guardrail misses are zero-tolerance gates.
- Package/dependency diff should remain none unless a strictly local non-AI dependency is proven necessary; current design requires none.
- Every production behavior change follows RED → GREEN → regression verification → commit.

---

### Task E1: Routing corpus schema and deterministic evaluator

**Files:**
- Create: `tests/fixtures/quality/routing-capabilities.json`
- Create: `tests/fixtures/quality/routing-corpus.json`
- Create: `src/evaluation/routing-quality.ts`
- Create: `tests/routing-quality.test.ts`

**Produces:**
- `RoutingQualityCase`
- `RoutingQualityMetrics`
- `evaluateRoutingQuality(corpus, capabilityRecords, options?)`
- stable per-case results and deterministic replay comparison

- [x] **Step 1: Write RED tests** that load a minimal corpus and assert exact metric calculations for tier accuracy, false-high-impact, unsafe overpermission, false-read-only, precision@2, unnecessary skill-load, verification correctness, and replay equality. Include malformed corpus cases that must throw.
- [x] **Step 2: Run** `npx vitest run tests/routing-quality.test.ts --reporter=verbose` and confirm RED because evaluator/fixtures do not exist.
- [x] **Step 3: Add a fixed evaluation registry fixture** with native frontend/docs/release skills, a reference-only backend debugging capability, and at least one lexical distractor. The fixture must contain no network/runtime dependency.
- [x] **Step 4: Add an initial routing corpus** of at least 32 cases spanning atomic read/mutation, structured read/mutation, domain-complex tasks, high-impact tasks, GitHub read/mutation, misleading lexical overlap, safe uses of generic `remove/review/build/get/check`, context-only strong skill matches, and ambiguous guidance.
- [x] **Step 5: Implement evaluator types/schema validation and metrics** using the real `CapabilityRegistry` + `CapabilityRouter`. For each case run the router twice and compare stable route projections.
- [x] **Step 6: GREEN verification:** run routing-quality plus existing router/registy tests and `npm run build`.
- [x] **Step 7: Commit** `feat: add deterministic routing quality corpus`.

### Task E2: Memory quality corpus and real-service evaluator

**Files:**
- Create: `tests/fixtures/quality/memory-corpus.json`
- Create: `src/evaluation/memory-quality.ts`
- Create: `tests/memory-quality.test.ts`

**Produces:**
- `MemoryQualityCase`
- `MemoryQualityMetrics`
- `evaluateMemoryQuality(corpus, options?)`
- temporary real `MemoryService` fixture runner with cleanup

- [ ] **Step 1: Write RED tests** for Recall@K, MRR, hard-guardrail recall, current revision correctness, prior failure recall, graph target recall, conflict visibility, artifact/procedure recall, noise displacement, project/principal contamination, character-budget behavior, and deterministic replay.
- [ ] **Step 2: Run** `npx vitest run tests/memory-quality.test.ts --reporter=verbose` and confirm RED because the evaluator/fixture are missing.
- [ ] **Step 3: Add declarative memory corpus** with at least 12 cases covering every design requirement. Fixture operations support commit, revise, explicit relation, conflict creation, query/preflight, alternate project/principal probes, aging, and character budget.
- [ ] **Step 4: Implement the evaluator** using temporary roots and the real `MemoryService`; never fabricate search hits or scores. Close services and remove temp roots in `finally`.
- [ ] **Step 5: Validate strict security metrics** so one contamination or hard-guardrail miss is visible as an explicit case failure, not hidden in an aggregate average.
- [ ] **Step 6: GREEN verification:** run memory-quality plus `memory-awareness`, `memory-retriever`, `memory-routing`, `project-scope-routing`, and `memory-performance` tests.
- [ ] **Step 7: Commit** `feat: add deterministic memory quality corpus`.

### Task E3: Unified report/gate and pre-tuning baseline

**Files:**
- Create: `src/evaluation/quality-gate.ts`
- Create: `tests/quality-gate.test.ts`
- Create: `scripts/evaluate-quality.mjs`
- Modify: `package.json`
- Modify: `docs/roadmap/agent-core-wave-e-implementation-plan.md`

**Produces:**
- `QUALITY_GATE_THRESHOLDS`
- `evaluateQualityGate(scorecard)`
- `npm run quality:report`
- `npm run quality:gate`

- [ ] **Step 1: Write RED tests** proving threshold pass/fail logic, zero-tolerance metrics, stable scorecard ordering/serialization, and nonzero gate exit behavior.
- [ ] **Step 2: Run** `npx vitest run tests/quality-gate.test.ts --reporter=verbose` and confirm RED.
- [ ] **Step 3: Implement thresholds exactly from the Wave E design.** Gate failures must list metric name, observed value, threshold, and failing case IDs.
- [ ] **Step 4: Implement script** that loads both corpora, runs both evaluators, prints stable JSON, and supports `--gate`. Report mode exits 0 even if thresholds fail; gate mode exits 1 for quality failure and 2 for evaluator/schema error.
- [ ] **Step 5: Add package scripts** `quality:report` and `quality:gate`. Do not add `quality:gate` to release verification yet.
- [ ] **Step 6: Run the first pre-tuning report twice** and require byte-equivalent metric/case ordering except source timestamp fields, or remove nondeterministic timestamp fields from the scorecard.
- [ ] **Step 7: Record exact pre-tuning routing/memory metrics** in this implementation plan under `Wave E Pre-Tuning Baseline` before any router/retriever/scoring production code is changed.
- [ ] **Step 8: Commit** `test: establish wave e quality baseline`.

### Task E4: Evidence-backed routing tuning

**Files:**
- Modify only if baseline proves a routing gap: `src/capabilities/router.ts`
- Modify only if baseline proves a capability-ranking gap: `src/capabilities/registry-service.ts`
- Modify: `tests/routing-quality.test.ts`
- Modify: existing routing regression tests only to preserve intended certified behavior, never to weaken corpus expectations.

- [ ] **Step 1: Identify failing routing metrics/case IDs from the committed baseline.** If all routing gates already pass, record `ROUTING_TUNING=NOT_REQUIRED` and skip Steps 2-6.
- [ ] **Step 2: Add focused RED regression tests** for each proven failure before changing production logic.
- [ ] **Step 3: Implement the smallest deterministic fix.** Preferred candidate order: intent-specific allowed tools for non-atomic read-only routes; higher precision high-impact matching; token-boundary capability scoring; skill threshold adjustment. Do not combine unrelated changes in one commit.
- [ ] **Step 4: Run focused GREEN tests** after each change plus the entire routing corpus.
- [ ] **Step 5: Compare new scorecard to pre-tuning baseline** and require target metric improvement with zero regression in any certified routing metric.
- [ ] **Step 6: Run router/MCP route enforcement/project-scope regressions and `npm run build`.
- [ ] **Step 7: Commit each independently reviewable tuning change** with a message describing the measured gap, then update the plan with before/after metrics.

### Task E5: Evidence-backed memory tuning

**Files:**
- Modify only if baseline proves a memory quality gap: `src/memory/retriever.ts`
- Modify only if required by evidence: `src/memory/scoring.ts`, `src/config.ts`
- Modify: `tests/memory-quality.test.ts`
- Modify existing memory tests only to add regressions, never to loosen isolation/guardrail/current-revision expectations.

- [ ] **Step 1: Identify failing memory metrics/case IDs from the committed baseline.** If all memory gates pass, record `MEMORY_TUNING=NOT_REQUIRED` and skip Steps 2-6.
- [ ] **Step 2: Add RED regression tests** for the proven gap.
- [ ] **Step 3: Implement the smallest deterministic change.** Do not adjust `scoreWeights` unless the corpus proves a ranking deficiency that cannot be fixed by a narrower retrieval/packing correction.
- [ ] **Step 4: Run focused GREEN tests**, the full memory corpus, memory-awareness, memory-retriever, memory-routing, isolation tests, and memory-performance.
- [ ] **Step 5: Compare scorecard to baseline** and require all zero-tolerance metrics remain perfect.
- [ ] **Step 6: If weights change, document exact old/new values and the cases/metrics that justify them.** Otherwise explicitly document no weight change.
- [ ] **Step 7: Commit** only after measurable improvement/preservation is proven.

### Task E6: Promote quality evaluation to a release gate

**Files:**
- Modify: `package.json`
- Modify if needed: release verification script chain
- Modify: `tests/release-package.test.ts` or a focused release-contract test if the repository has a suitable assertion surface.

- [ ] **Step 1: Write RED contract test** proving `verify:release` includes Wave E quality gate after normal build/test prerequisites.
- [ ] **Step 2: Add `quality:gate` to the release verification path** in a position where compiled evaluator code exists and before release metadata certification completes.
- [ ] **Step 3: Run `npm run quality:gate` and focused release-contract tests.** Require all Wave E thresholds PASS.
- [ ] **Step 4: Run `npm run verify:release` once on the feature branch and confirm no tool-surface/dependency regression.
- [ ] **Step 5: Commit** `test: enforce routing and memory quality gate`.

### Task E7: Performance, adversarial acceptance, documentation, and integration

**Files:**
- Modify: `docs/deterministic-memory.md`
- Modify: `docs/stability.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`
- Modify: `docs/roadmap/agent-core-wave-e-implementation-plan.md`

- [ ] **Step 1: Run focused adversarial Wave E acceptance**: routing corpus, memory corpus, isolation cases, hard guardrail, current revision, deterministic replay, MCP route enforcement, Wave D audit/security regressions.
- [ ] **Step 2: Run the 100k memory benchmark** after build with at least 5 measured samples and 2 warmups; require preflight p95 `< 150 ms` and record the exact observed value.
- [ ] **Step 3: Run** `git diff --check`, `npm run check:brand`, dependency diff against `7f6968b`, and doc-link verification.
- [ ] **Step 4: Run final feature-branch `npm run verify:release`** and record file/test/skip counts.
- [ ] **Step 5: Confirm the 55-tool surface in both MCP eras** and Wave A public trust-boundary behavior on a temporary/local canary.
- [ ] **Step 6: Update docs with exact baseline → final metrics**, any routing/memory changes, performance result, and explicit `external AI model/API dependency = 0`.
- [ ] **Step 7: Commit** `docs: record wave e local certification evidence`.
- [ ] **Step 8: Before integration fetch `origin/main`** and require the feature merge-base remains the Wave E base or reconcile any concurrent main changes explicitly.
- [ ] **Step 9: Fast-forward main only when topology is compatible; run fresh merged-main `npm ci` + `npm run verify:release`; push non-force and require local/remote equality.
- [ ] **Step 10: Controlled runtime source-sync** and require `HEAD == origin/main == connection.sourceCommit`; public health/security + legacy/modern 55-tool canary.
- [ ] **Step 11: Commit/push final docs-only certification if needed, source-sync again, then remove only the Wave E worktree/local branch after exact equality is proven.

## Wave E Exit Matrix

```text
routing corpus                         PASS
memory quality corpus                  PASS
tier accuracy                          >= 0.95
false high-impact rate                 = 0
unsafe route overpermission            = 0
false read-only classification         = 0
relevant skill precision@2             >= 0.90
unnecessary skill-load rate            <= 0.05
routing determinism                    = 1.00
memory Recall@K                        >= 0.95
memory MRR                             >= 0.90
hard-guardrail recall                  = 1.00
current-revision correctness           = 1.00
prior-failure recall                   = 1.00
graph-target recall                    = 1.00
conflict visibility                    = 1.00
artifact/procedure recall              = 1.00
noise displacement rate                <= 0.05
cross-project contamination            = 0
cross-principal contamination          = 0
character-budget correctness           = 1.00
memory retrieval determinism           = 1.00
100k memory preflight p95              < 150 ms
Wave A/B/C/D compatibility             PASS
full release regression                PASS
package/dependency change              none expected
external AI model/API dependency       = 0
```

## Wave E Pre-Tuning Baseline

`BASELINE_STATE=NOT_CAPTURED`. This is an explicit execution gate: no routing or memory production heuristic/weight tuning is permitted until Task E3 replaces this state with the measured baseline scorecard.
