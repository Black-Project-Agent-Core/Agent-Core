# Automated Reflexion Contract Regression — Agent Core

> **Status:** COMPLETE — VERIFIED FOR APPROVED SCOPE  
> **Implemented:** 2026-09-18  
> **Parent system:** completed `docs\Reflexion-Integration-Plan.md`  
> **Runtime impact:** NONE — verification-only regression  
> **Primary implementation:** `tests\reflexion-contract.test.ts`  
> **Outstanding work:** NONE

This document records the completed regression guard for the Agent Core Reflexion controller contract. It is no longer an implementation plan.

## 1. Purpose

Prevent future edits from silently weakening the implemented Reflexion behavior or replacing the controller-side design with a second gated runtime.

The regression runs only during authorized verification. It does not call a model, execute reflection, mutate memory, gate tools, create a retry engine, or depend on the retired Reflexion research checkout.

## 2. Protected behavioral invariants

The targeted test protects these semantic invariants without full-text snapshotting:

1. `AGENTS.md` contains the `Failure-learning / Reflexion protocol` section.
2. Reflexion is triggered by real failure/correction evidence rather than required after routine success.
3. Direct failing evidence is the first evidence source.
4. Equivalent blind retry is explicitly prohibited.
5. Recurrent durable recall is bounded to **1–3** relevant lessons.
6. Task-local reflection is not automatically canonical memory.
7. Durable promotion requires a materially successful correction plus evidence/reuse value.
8. Hidden/private reasoning, raw scratchpads, and full chain-of-thought persistence remain prohibited.
9. Reflexion remains controller behavior over existing evidence + MemoryService.
10. Autonomous retry loops, second agent/runtime, reflection database, and machine-control gates remain prohibited.
11. `loadAgentProtocol()` loads the current root `AGENTS.md` contract.

## 3. Architecture guards

The regression additionally checks that:

- direct machine-control tools remain registered through `src\mcp\server.ts`;
- Memory remains a sibling capability;
- `capability_route` is not reintroduced;
- no `ReflexionService` runtime is introduced in the MCP handler path;
- root dependencies do not add LangChain, ChromaDB, or a Reflexion runtime package;
- active Agent Core source does not depend on a recreated `src\reflexion` subsystem.

The test relies only on Agent Core's own active contract/source.

## 4. Implementation

Implemented test:

```text
tests\reflexion-contract.test.ts
```

The test:

- imports `loadAgentProtocol()`;
- compares loaded instructions with current root `AGENTS.md`;
- validates semantic anchor groups with focused regular expressions;
- reads only active source/package metadata for architecture guards;
- contains a built-in negative control that removes the blind-retry invariant from an in-memory copy and proves the regression rejects the weakened contract;
- restores/uses the real contract without modifying `AGENTS.md`.

No stable marker was required because the semantic anchors are sufficiently precise.

## 5. Verification evidence

Targeted verification on 2026-09-18:

```text
tests/reflexion-contract.test.ts
3 / 3 tests PASS
```

The same targeted run also included the loop-detector regression:

```text
Test files : 2 PASS
Tests      : 12 PASS
```

The Reflexion contract test proved:

- current contract passes;
- deliberate removal of the blind-retry invariant fails the semantic assertion;
- the untouched contract passes immediately afterward;
- no production runtime path is needed for this regression;
- dependency/architecture guards remain clean.

Broader root/UI/.NET regression was not run because broad verification remains separately user-authorized.

## 6. Runtime boundary

This regression adds **no production runtime behavior**.

The separate deterministic advisory loop detector is documented in:

```text
docs\Deterministic-Advisory-Loop-Detector-Plan.md
```

That runtime hardening complements the controller contract and is implemented separately by the completed advisory-loop-detector integration.

## 7. Rollback boundary

Rollback for this completed regression is surgical:

- remove `tests\reflexion-contract.test.ts`;
- do not change Agent Core Memory;
- do not alter the Reflexion controller contract merely to remove the test;
- do not recreate or depend on the retired research checkout.

## 8. Completion state

The approved regression scope is complete and verified.

**Outstanding work from this plan: NONE.**
