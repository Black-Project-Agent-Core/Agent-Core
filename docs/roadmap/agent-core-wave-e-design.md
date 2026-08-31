# Agent Core Wave E — Routing & Memory Quality Intelligence Design

**Status:** Approved direction, implementation design
**Base:** `7f6968b25d63b14bc97c67bb7a5e50db8c91b809`
**Goal:** improve routing and deterministic memory decision quality using local, reproducible, quantitative evaluation before any heuristic or weight tuning.

## Non-negotiable invariants

- No external AI model, model API key, cloud embedding, vector SaaS, cloud reranker, or AI judge.
- Agent Core remains deterministic and local-first.
- The certified 55-tool MCP surface does not change in Wave E.
- Wave A HTTP/OAuth trust boundaries remain authoritative.
- Wave B legacy `2025-11-25` and modern `2026-07-28` MCP behavior remain compatible.
- Wave C execution evidence/recovery semantics remain unchanged.
- Wave D audit/trace/metrics behavior remains unchanged.
- Routing or memory tuning is forbidden until its pre-tuning corpus baseline is recorded.
- A tuning change is accepted only when it improves or preserves the targeted quality metrics and does not violate any security, isolation, determinism, or performance gate.

## Architecture

Wave E adds an offline quality plane that is deliberately separate from runtime request handling:

```text
repo-owned quality corpus
        ↓
deterministic corpus runner
        ↓
routing evaluator ─────┐
                       ├─→ unified quality scorecard → certification gate
memory evaluator ──────┘
        ↓
baseline evidence
        ↓
only evidence-backed heuristic/weight tuning
        ↓
re-run same corpus + performance gates
```

The corpus is versioned source data. Evaluation never calls the network and never asks another model to judge an answer. Every expected property is machine-readable.

## Routing quality corpus

The routing corpus uses a fixed synthetic capability registry so scores are reproducible across machines and independent of the user's installed capability catalog. Cases cover:

- atomic read-only work;
- atomic mutation work;
- structured read-only investigation;
- structured mutation;
- domain-complex frontend/debug/docs/release work;
- high-impact credential/system/production actions;
- GitHub read versus GitHub mutation;
- misleading lexical overlap;
- generic words such as `remove`, `review`, `build`, `get`, and `check` in safe contexts;
- strong context that must not force an unnecessary skill load for atomic work;
- ambiguous tasks where broad capability guidance is acceptable but overpermission is not.

Each routing case declares:

```text
id
task
context
expected tier or accepted tier set
expected domain/capability family
must-allow tools
must-not-allow tools
expected top capability IDs when applicable
skill-load expectation
verification expectation
risk expectation or allowed risk range
```

### Routing metrics

The evaluator reports exact numerator/denominator values and rates for:

- tier accuracy;
- false high-impact rate;
- unsafe overpermission rate;
- false read-only classification rate;
- relevant capability/skill precision@K;
- unnecessary skill-load rate;
- verification correctness;
- deterministic replay equality.

Initial certification thresholds:

```text
tier accuracy                       >= 0.95
false high-impact rate              = 0
unsafe overpermission rate          = 0
false read-only classification      = 0
relevant skill precision@2          >= 0.90
unnecessary skill-load rate         <= 0.05
verification correctness            = 1.00
deterministic replay equality       = 1.00
```

`unsafe overpermission` is intentionally strict. A case fails this metric when the route exposes a tool explicitly forbidden by the corpus expectation, especially write/process/execution mutation tools on a read-only task.

## Memory quality corpus

The memory corpus drives the real `MemoryService` against temporary local SQLite stores. It uses deterministic fixture operations rather than direct expected-score fabrication. Cases cover:

- old pinned hard guardrail versus fresh related noise;
- mutable decision revision correctness;
- prior failure recall;
- multi-hop graph recall;
- conflict visibility;
- relevant artifact/procedure recall;
- stale-noise resistance;
- cross-project isolation;
- cross-principal isolation;
- deterministic replay;
- character-budget packing;
- hard-guardrail budget priority.

Each case declares fixture memories/relations/revisions/conflicts, a query or preflight task, and expected relevant/excluded keys or behaviors.

### Memory metrics

The evaluator reports:

- Recall@K;
- MRR / first-relevant rank;
- hard-guardrail recall;
- current-revision correctness;
- prior-failure recall;
- graph-target recall;
- conflict visibility rate;
- artifact/procedure recall;
- noise displacement rate;
- cross-project contamination count;
- cross-principal contamination count;
- character-budget correctness;
- deterministic replay equality.

Initial certification thresholds:

```text
Recall@K                           >= 0.95
MRR                                >= 0.90
hard-guardrail recall              = 1.00
current-revision correctness       = 1.00
prior-failure recall               = 1.00
graph-target recall                = 1.00
conflict visibility                = 1.00
artifact/procedure recall          = 1.00
noise displacement rate            <= 0.05
cross-project contamination        = 0
cross-principal contamination      = 0
character-budget correctness       = 1.00
deterministic replay equality      = 1.00
```

Hard active guardrails retain their existing safety priority: they may be packed even when a normal non-hard hit would exceed the character budget. The corpus verifies that this exception is bounded to hard guardrails and that ordinary hits still obey the budget.

## Unified quality gate

A local script produces one stable JSON scorecard containing:

```text
schema/version
source commit
evaluator version
routing metrics + per-case failures
memory metrics + per-case failures
thresholds
overall pass/fail
```

The script has two modes:

- report mode: always prints the scorecard and exits 0 so a pre-tuning baseline can be captured;
- gate mode: exits nonzero when a certified threshold is violated.

After evidence-backed tuning is complete, gate mode is added to the release verification path. This prevents future routing/memory regressions from silently shipping.

## Evidence-backed tuning policy

### Routing

Likely tuning candidates are limited to the current deterministic logic in `src/capabilities/router.ts` and `src/capabilities/registry-service.ts`:

- intent classification for read versus mutation beyond atomic routes;
- high-impact signal precision;
- lexical capability scoring/token boundaries;
- skill-load thresholding.

No candidate is changed merely because it appears theoretically cleaner. The pre-tuning scorecard must identify a failing metric/case first.

### Memory

Candidate changes are limited to `src/memory/retriever.ts`, `src/memory/scoring.ts`, and `MemoryConfig.scoreWeights`. If the baseline already satisfies all memory quality thresholds, Wave E records that fact and leaves memory scoring unchanged. If a metric fails, the smallest deterministic change is tested against the full corpus before acceptance.

## Performance gates

Quality improvement must not trade away bounded local performance. Final Wave E certification runs:

- existing routing/unit regressions;
- existing memory performance tests;
- the existing memory benchmark at 100,000 active memories with the certified p95 target of `< 150 ms` for preflight;
- full `npm run verify:release`.

The 100k benchmark remains a certification-time gate rather than a per-test release step because it is materially heavier than the deterministic quality corpus.

## Failure policy

- Corpus schema errors fail closed.
- Unknown expected tool/capability IDs fail the evaluator rather than being ignored.
- Any nondeterministic replay difference fails the relevant evaluator.
- Any cross-project or cross-principal contamination is an immediate Wave E gate failure regardless of aggregate recall score.
- Any hard-guardrail miss is an immediate Wave E gate failure.
- Performance regression blocks integration even if quality metrics improve.

## Deliverables

- repo-owned routing corpus;
- repo-owned memory quality corpus;
- deterministic routing evaluator;
- deterministic memory evaluator using real MemoryService behavior;
- unified report/gate script;
- baseline scorecard recorded before tuning;
- evidence-backed routing tuning only where baseline proves a gap;
- evidence-backed memory tuning only where baseline proves a gap;
- release gate integration;
- final Wave E certification evidence and controlled integration to `main`.
