# AutoResearchClaw Steal/Use Integration Plan
> Status: COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-CAPABLE OFFLINE ANALYSIS — REFERENCE RETIRED
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\06-AutoResearchClaw`
> Pin: `be4ba4755bf1b52220f25e13b2293b5956590070`
> License: MIT
> Grounding date: 2026-09-25

## 1. Grounding basis
The checkout contains 756 non-Git files, 413 Python source files and 105 test files.
The audit used source/test families rather than README feature lists.
Deep inspection covered claim verification, verified-value registry, experiment diagnosis/repair,
convergence analysis, runner/review stages, branching/escalation, and current Agent Core Learning reports.

## 2. Selectable proposal
### ARC-P1 — evidence-locked quantitative claim registry
Adapt the deterministic core of `pipeline/verified_registry.py` for Agent Core's offline Learning reports.
The target is not a research-paper agent; it is a numeric provenance guard for generated summaries.

Observed source mechanism:
- build a registry from actual experiment artifacts;
- retain source/provenance for each numeric value;
- derive bounded presentation variants such as rounding and percentage conversion;
- verify a claimed number against grounded values with explicit tolerance;
- distinguish condition names and per-seed/aggregate values.

Current Agent Core gap:
- report bundles already bind identity, hashes, completeness, evaluator/verifier revisions, and recompute scores;
- effect evidence and mechanism attribution remain conservative;
- there is no shared registry that proves every numeric value emitted by a human-readable analysis sidecar came from a verified input metric.

Proposed native owner:
- `src/learning/verified-value-registry.ts`;
- integrate only into explicit offline report/analysis generation;
- optional `scripts/learning/verify-summary.mjs` for read-only inspection.
No new MCP tool, evaluator daemon, model call, or literature service.

Required semantics:
- registry accepts only already verified report artifacts;
- each accepted numeric claim carries a safe metric/source pointer;
- rounding/percentage variants are explicit transformations, never guessed;
- unmatched values remain `unverified` and cannot be labeled measured;
- tolerance is metric-aware and bounded, not a blanket fuzzy match;
- no raw private prompts, billing records, credentials, or arbitrary external papers are ingested.

Acceptance:
1. exact, rounded, and percentage-form claims retain provenance;
2. unsupported numbers are rejected/flagged;
3. same numeric value from multiple sources preserves ambiguity rather than inventing one origin;
4. NaN/Infinity and malformed metrics fail closed;
5. incomplete/invalid report bundles never seed the registry;
6. current scoring/verifier outputs remain byte/semantically compatible;
7. no Memory candidate is promoted merely because a number parses.

Release impact if selected: patch if limited to existing offline reports; minor only if public schema grows materially.

## 3. Rejected / deferred AutoResearchClaw mechanisms
- regex/LLM literature claim verifier: REJECT — domain-specific and would create a second research-fact subsystem.
- experiment repair loop: REJECT — duplicates Reflexion and conflicts with user-controlled testing.
- convergence evaluator: DEFER — domain/numerical-method specific; EvoAgentX offers a more generic advisory candidate.
- unattended escalation with auto-approve/auto-abort: REJECT — conflicts with human authorization boundaries.
- tournament/debate/branching research agents: REJECT — autonomous workflow expansion, not a current Agent Core owner.
- paper mode selection: REJECT as separate subsystem; current Learning already distinguishes complete/failed/incomplete evidence.

## 4. Retirement condition
The reference is NOT a corpse while ARC-P1 remains selectable.
After selection/rejection and any implementation, perform exact source/test/dependency census before retirement.

## 5. Approved execution result — 2026-09-25
ARC-P1 is implemented and complete as explicit offline Learning analysis. The verified-value registry and advanced CLI provenance tests pass 4/4 + relevant CLI coverage; no resident daemon or new MCP tool is required. Numeric provenance remains bounded and review-required. Root TypeScript compilation exits 0. Execution authority: `docs/Six-Reference-Adoption-Execution-20260925.md`.

## 6. Final retirement closure — 2026-09-25
ARC-P1 remains implemented as explicit offline Learning numeric provenance. Final census at the pinned clean revision found no additional current-fit mechanism after excluding existing Reflexion and EAX stability owners, no active source/script/test dependency, no process dependency, and no reparse-point boundary.
MIT provenance is retained in this plan and `THIRD_PARTY_NOTICES.md`.
Reference disposition: **RETIRED/DELETED**. The former `06-AutoResearchClaw` checkout is absent after authorized deletion.
