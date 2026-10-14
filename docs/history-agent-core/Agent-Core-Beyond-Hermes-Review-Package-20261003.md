# Agent Core Beyond Hermes — Review Package

**Status:** REVIEW-READY, NOT IMPLEMENTED  
**Date:** 2026-10-03  
**Agent Core snapshot:** `E:\Projects\Agent-Core@639cdf77fd7288a722131862e22eecaff4a90f07`  
**Hermes comparison snapshot:** `NousResearch/hermes-agent@bd0affe5e5f723579df8902852f5d0c47795f355`  
**P8:** NOT RUN  
**Live benchmark:** NOT RUN  
**Implementation:** NOT STARTED

## Executive decision

The first engineering target should be **DTC-1: Durable Turn Continuation + Provider Transition Guard**.

Reason:
- Agent Core already has persistent credential rotation, cooldown/quota/breaker state, completed chat continuity, verified Learning, and Mutation Safety.
- The clearest Hermes advantage relevant to reliability is durable in-turn conversation/tool progress plus stronger long-context handling.
- Agent Core currently terminalizes an interrupted running turn at service initialization; it does not reconstruct a canonical tool-call/result continuation transcript.
- Closing that gap compounds existing Agent Core strengths instead of duplicating router/Memory/Skill systems.

## Files

1. `Agent-Core-Beyond-Hermes-Grounding-20261003.md`  
   Source-grounded Hermes/Agent Core/router comparison, source anchors, strengths, UNKNOWNs, strategic conclusion.  
   SHA-256: `2f4172b8b037f8f2d475662409555f442c93de79f7f88866087d594a7c13e847`

2. `Agent-Core-Provider-Continuity-Design-20261003.md`  
   Canonical provider/key continuity invariants, safe failover boundaries, side-effect reconciliation, compression and streaming policy.  
   SHA-256: `84e8606d95e49644be70d1e8763f7902a27097c6b1c741cede6377e6efe04388`

3. `Agent-Core-vs-Hermes-Benchmark-Protocol-20261003.md`  
   Fair system comparison + Agent Core mechanism A/B protocol; 14 task families; predeclared hard gates and statistical claim threshold.  
   SHA-256: `21063b2b38451cbf58e4497d196151fe20dc90bc8f2991f44c1b2bd2c211d975`

4. `Agent-Core-First-Vertical-Slice-Plan-20261003.md`  
   DTC-1 source-level implementation plan, exact owners, tests DTC-A1..A12, risks, rollback, and decisions still required.  
   SHA-256: `ebd125cc7f3f2ada6982e5e269d35ee23f5bc41400a2c2868694b5b0850c8de1`

5. `Agent-Core-vs-Hermes-Evidence-Matrix-20261003.json`  
   25 mechanism rows with explicit IMPLEMENTED/WIRED/MOCK-TESTED/INTEGRATION-TESTED/RUNTIME-OBSERVED/UNKNOWN fields.  
   SHA-256: `dab5273151a6f464a87830e598268f33a9d56c60156fd732fa791d77e731ae3d`

6. `Agent-Core-vs-Hermes-Evidence-Matrix-20261003.csv`  
   Spreadsheet-friendly copy of the same evidence matrix.  
   SHA-256: `d4edb32b564f48f3fe34261e143bf4f2e24d642574a0dd842cba29e2572b8fed`

## What is already strong

- evidence-attributed Memory use rather than retrieval-only claims;
- verified Learning finalization;
- persistent provider credential state;
- provider/key cooldown, quota and breaker semantics;
- completed-turn restart continuity;
- Mutation Safety uncertain-replay refusal;
- one shared external/native Agent Core body.

## Where Hermes is source-grounded stronger

- crash-safe mid-turn transcript/tool persistence;
- long-context compression/replay engineering;
- prompt-cache/cost optimization;
- autonomous skill review/curation breadth;
- broad credential-source/OAuth lifecycle;
- coding-workspace verification ledger and schema-validation ergonomics.

No runtime winner is declared. Hermes was not executed in this task.

## Highest-priority gap

**Canonical durable in-turn continuation state.**

The gap is not key rotation itself. It is safely preserving:
- tool calls/results,
- strategy state,
- evidence,
- mutation receipt state,
- provider transition state,
- verification contract,

across a provider failure or process reconstruction without duplicating side effects.

## Recommended implementation boundary

First candidate:
- persist a bounded turn checkpoint in existing AgentChatStore;
- resume the same runtime task explicitly;
- retain current fail-closed interrupted-turn behavior when checkpoint safety cannot be proven;
- keep same-provider key rotation unchanged;
- permit automatic cross-provider DTC-1 transition only for conservative exact-compatible routes;
- do not add a second router, Memory system, Learning system, or controller.

## Decisions required before implementation

1. Resume UX: recommended explicit resume; never automatic provider/tool work on startup.
2. DTC-1 cross-provider policy: recommended exact same model identifier only.
3. Checkpoint retention: recommended latest active/interrupted checkpoint, compact/remove after finalization while retaining normal evidence.
4. Oversized tool-result policy: recommended bounded inline state + existing artifact/evidence reference.

## Acceptance boundary

Implementation should stop before resident restart/live-provider testing until separately authorized.

The first targeted proof should be deterministic loopback fault injection, not paid-provider testing.

A "surpasses Hermes" claim is allowed only after the predeclared matched benchmark passes its safety gates and version/model/budget/suite scope is stated.
