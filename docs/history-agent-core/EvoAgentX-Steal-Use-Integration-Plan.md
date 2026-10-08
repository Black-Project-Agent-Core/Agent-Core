# EvoAgentX Steal/Use Integration Plan
> Status: COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-CAPABLE OFFLINE ANALYSIS — REFERENCE RETIRED
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\08-EvoAgentX`
> Pin: `d77fd6b9a3e76c8dd83bebe3374c53a3f5d16f54`
> License: MIT (with documented third-party MIT components)
> Grounding date: 2026-09-25

## 1. Grounding basis
The checkout contains 563 non-Git files, 367 source files and 42 test files.
Source-first inspection covered optimizers, evaluator framework, workflow/HITL, memory/RAG,
`map_elites_optimizer.py`, convergence utilities, experience utilities and current Agent Core Learning reports.
No optimizer benchmark claim was accepted from documentation alone.

## 2. Selectable proposals
### EAX-P1 — offline quality-diversity archive report
Adapt the pure archive idea from `MapElitesOptimizer` without adopting its optimizer loop.

Observed source behavior:
- user-declared feature dimensions and ranges map candidates into deterministic behavior-space cells;
- each cell retains its best observed fitness candidate;
- archive preserves diverse specialists that a single global score can hide.

Current Agent Core gap:
ASI-P3/retrieval-portfolio preserves query-coverage specialists, but it does not show diversity across
other verified behavioral/resource dimensions such as regression rate, cost, latency, or failure-surface counts.

Proposed owner:
- `src/learning/retrieval-diversity.ts`;
- explicit `--diversity` mode in the existing offline analysis CLI.
Inputs are already verified candidate reports plus operator-declared numeric dimensions/ranges.
No candidate generation, mutation, random search, deployment selection, or model call.

Acceptance:
deterministic binning; stable boundary handling; missing/non-finite dimensions fail closed;
best-per-cell is traceable to report identity; incomparable protocols are never mixed;
all original candidates remain visible in the audit sidecar; output is descriptive, not a deployment recommendation.

### EAX-P2 — convergence/stability advisory for repeated verified evaluations
Adapt only the statistical stopping evidence concept from `convergence_utils.py`.

Proposed behavior:
- consume ordered comparable evaluation rounds;
- report observed mean/dispersion and a bounded consecutive-stability window;
- status is `insufficient-data|stable-window-observed|not-stable`;
- never automatically stop training/testing, approve a release, or mutate the agent.

Use the existing ASI protocol/stopping-rule report fields to carry the declaration and observation.
Do not copy the source default blindly; define explicit nonzero tolerances/confidence semantics and test them.

Acceptance:
zero/one-round input is insufficient; changing protocol breaks the series; identical flat rounds can become stable;
large shifts reset the streak; missing dispersion stays unknown; advisory never triggers execution.

## 3. Rejected EvoAgentX mechanisms
- full AFlow/TextGrad/MIPRO/SEW/MAP-Elites optimization loops: REJECT — autonomous candidate mutation/search.
- workflow/agent generator: REJECT — duplicates external controller and would create a second orchestration runtime.
- EvoAgentX memory/RAG/vector stores: REJECT — duplicates Memory/Grafel/Semantic owners.
- HITL manager: REJECT — incomplete modes and duplicates existing explicit authorization boundaries.
- experience prompt prohibitions: REJECT — current Reflexion evidence is more conservative and source-grounded.

## 4. Retirement condition
The reference is NOT a corpse while EAX-P1/EAX-P2 remain selectable.
After selection/rejection, preserve applicable MIT/third-party notices and run a final uniqueness/dependency census before deletion.

## 5. Approved execution result — 2026-09-25
EAX-P1 and EAX-P2 are implemented and complete as explicit offline Learning analysis modes. Diversity passes 3/3; stability passes 4/4; advanced CLI integration passes 4/4. Neither mode generates candidates, stops execution, approves deployment, or mutates Memory. Root TypeScript compilation exits 0. Execution authority: `docs/Six-Reference-Adoption-Execution-20260925.md`.

## 6. Final retirement closure — 2026-09-25
EAX-P1/P2 remain complete as explicit offline Learning analysis. Final census at the pinned clean revision found no additional current-fit mechanism after excluding autonomous optimizers/workflow generation and existing Memory/Grafel owners, no active source/script/test dependency, no process dependency, and no reparse-point boundary.
MIT/third-party provenance is retained in this plan and `THIRD_PARTY_NOTICES.md`.
Reference disposition: **RETIRED/DELETED**. The former `08-EvoAgentX` checkout is absent after authorized deletion.
