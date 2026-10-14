# Cognee Steal / Use Integration Plan

> **Status:** CG-P1/P2 COMPLETE — TARGETED VERIFIED — MANIFEST BUDGET PASS — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\20-cognee`
> **Repository:** `https://github.com/topoteretes/cognee.git`
> **Revision:** `c0d18c80e24b7b78918e7642c03f6f128fdd2aee`
> **Branch:** `main`
> **License:** Apache-2.0

## 1. Source-first evidence

Fresh census found 3,593 non-Git files, 2,989 executable-code files and 872 test files. Audit covered retrieval, session lifecycle, user-preference weights, feedback/frequency weighting, temporal retrieval, memify tasks, pipeline/cache and graph/vector orchestration.

## 2. CG-P1 — bounded explicit-feedback influence in Memory fusion ranking

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.

Source evidence:
- `tasks/memify/apply_feedback_weights.py`;
- feedback is normalized and applied with a bounded streaming update;
- only exact node/edge IDs used by answered retrieval are updated;
- per-QA processing markers make application idempotent;
- failures do not pretend weights were applied.
Verified Agent Core gap:
- Agent Core has explicit `memory_feedback` and bounded salience state;
- salience influences retention/retirement scoring;
- exact source scan of `src/memory/retrieval.ts` finds no salience use in legacy/BM25/fusion ranking;
- retrieval ledger already records exact selected/exposed Memory IDs, so a new attribution store is unnecessary.

Proposed adaptation:
- make existing explicit Memory feedback influence only the `fusion` ranking profile;
- load the bounded salience map once per search and add a small, clamped, explainable feedback component after query-evidence channels are computed;
- query relevance stays dominant: feedback cannot make a zero-evidence memory eligible and cannot bypass concrete-identifier filters;
- `stale/wrong` only reduce rank; `helpful` only provides a bounded boost;
- record the feedback component in existing score diagnostics/retrieval ledger;
- no automatic feedback generation, no retrieval-count feedback loop and no model-derived rating.

Acceptance:
- legacy and BM25 profiles remain unchanged;
- fusion without feedback remains compatible;
- explicit feedback changes only bounded relative ranking among query-eligible candidates;
- a no-match memory cannot surface solely due to salience;
- repeated retrieval alone never changes feedback weight;
- diagnostics remain observational and never claim causal benefit.
## 3. CG-P2 — explicit historical/as-of temporal retrieval

**Disposition:** CONDITIONAL CURRENT-FIT — implement only if public-schema manifest stays inside the reviewed MCP budget.

Source mechanism:
- Cognee temporal retrieval separates temporal filtering from semantic ranking and falls back when no temporal evidence is available.

Current Agent Core state:
- Memory links carry `validFrom`, `validTo` and `referenceTime`;
- active traversal evaluates link validity at present/default time;
- there is no explicit controller-supplied historical reference time on `memory_search`.

Proposed adaptation:
- allow a validated explicit `asOf` timestamp for link-validity evaluation during search;
- never parse dates from natural language with an LLM;
- direct record relevance remains unchanged; only temporal-link activity uses the requested reference time;
- expose reference time in retrieval-ledger evidence;
- if schema growth pushes the MCP manifest over budget, deduplicate existing schema descriptions first or defer this proposal.

Acceptance:
- omitted `asOf` is current behavior;
- historical queries activate only links valid at that time;
- invalid timestamps fail closed;
- no canonical mutation occurs;
- manifest remains inside reviewed byte/token budget.
## 4. Covered / rejected families

Covered:
- hybrid lexical/semantic retrieval, embeddings, typed relations, provenance, retrieval ledger, explicit feedback store and retention review;
- Grafel is already structural code-graph authority and is not replaced by Cognee.

Rejected:
- alternate graph/vector/database runtime;
- LLM time extraction;
- automatic feedback or frequency-weight learning from mere retrieval;
- self-reinforcing frequency boosts;
- session completion/model runtime and a separate user-profile database;
- autonomous memify graph mutation.

## 5. Reference disposition

**RETAIN.** CG-P1 is current-fit and CG-P2 is conditional pending review + manifest-budget feasibility. No implementation/build/restart/release occurs in this pass.

## 6. Approved execution result — 2026-09-27

CG-P1/P2 are present in current source/dist. Fusion-only feedback influence is clamped and cannot create query eligibility; explicit `asOf` controls temporal-link validity without LLM date parsing or canonical mutation.

The compiled 70-tool manifest is 116,107 bytes / ~29,027 tokens, so CG-P2 satisfies its conditional MCP-budget gate. Direct wave acceptance verified both feedback ranking and historical temporal retrieval.

The re-cloned/pinned Cognee reference was retired after post-adoption census found no remaining current-fit residual. Live resident activation is complete after the user-controlled restart/reconnect; installed-runtime acceptance is recorded in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.
