# Implementation plans and status

Source candidate **`0.15.0-beta.1`**. Source implementation, offline verification, published artifact and resident acceptance are separate gates. User authorization on 2026-10-10 covers implementation of Plans02–05 together; it does not authorize a provider benchmark or automatic production re-embedding.

[Documentation](../README.md) · [Codebase](../CODEBASE.md) · [Candidate notes](../releases/0.15.0-beta.1.md)

## Implemented and accepted predecessor scope

[Memory01](../memory/plans/2026-10-09-memory-01-filtered-semantic-retrieval.md) and [Workflows](2026-10-09-unified-workflows.md) have [reviewed Windows functional acceptance](../memory/verification/memory01-windows-functional-2026-10-10.md). Do not repeat closed acceptance without a new regression reason.

## Current source candidate

| Plan | Implemented scope | Rollout boundary |
| --- | --- | --- |
| [Memory02](../memory/plans/2026-10-09-memory-02-controller-ranking-policy.md) | Host-owned opt-in fusion/feedback and stable revision-bound pagination | Default remains baseline; relevance gain not established |
| [Memory03](../memory/plans/2026-10-09-memory-03-task-workspace-binding.md) | Credential-owner and registered-workspace task binding, explicit v2 selector | External clients must update envelopes; Learning task groups remain serialized |
| [Memory04](../memory/plans/2026-10-09-memory-04-contextual-index.md) | Title-aware document v2 and derived index v3 | Automatic startup re-embedding needs provider/data/volume/cost approval |
| [Memory05](../memory/plans/2026-10-09-memory-05-outcome-evaluation.md) | Isolated deterministic outcome harness and evidence verification | Synthetic results do not prove model benefit; live gate remains separate |

## Approved Windows Batch 3–4 (13 October 2026)

| Plan | Implemented source/build | Remaining deployment boundary |
| --- | --- | --- |
| [Batch 3 — bounded Memory subquestions](../memory/plans/2026-10-12-batch-03-bounded-memory-subquestions.md) | Explicit planned context v2 with host-bound serial canonical recall, exact revision merge, budget, synthesis and disclosure | Client refresh verified; one real v2 context returned 2 root hits then partial/deadline. Full subquery completion remains unobserved; no more upload/restart requested. |
| [Batch 4 — view-bound visual review](2026-10-12-batch-04-view-bound-visual-review.md) | Existing image_inspect overview/crop gains immutable viewDigest and declarative review action with view/source binding | Client refresh verified; real overview followed by review succeeded with matching digests and separate missing/declared-unknown counts. No semantic-quality or all-edge-case guarantee. |

No new public tool names, provider, memory store or automatic evaluation. Historical draft state in the pinned plan text is superseded only by the dated Windows execution section appended to each plan.

## Proposed, not implemented

**Closed scope, not an active proposal:** the [Native Agent Core architecture integration roadmap (Revision 4)](../history-agent-core/Integrasi-Arsitektur-Native-Agent-Core.md) was **CLOSED BY USER DECISION on 2026-10-24**. Native and authenticated external MCP remain available for authorized operational use based on prior resident/source evidence. Model/Memory benchmarks and later performance waves are **not active acceptance tasks**. Historically inconclusive Memory-benefit results are preserved in the [R4 execution report](../history-agent-core/Native-Architecture-Integration-Revision-4-Execution.md), without claiming PASS. Older Revision 1 PROPOSED and open-wave wording is history, not the current status.

| Plan | Intended change |
| --- | --- |
| [Memory 06](../memory/plans/2026-10-09-memory-06-query-evidence-excerpts.md) | Query-focused evidence excerpts |
| [Memory 07](../memory/plans/2026-10-09-memory-07-passage-retrieval.md) | Derived passage-level retrieval |
| [Memory 08](../memory/plans/2026-10-09-memory-08-query-embedding-cache.md) | Bounded volatile query embedding cache |
| [Memory 09](../memory/plans/2026-10-09-memory-09-subquestion-retrieval.md) | Bounded controller-led subquestion retrieval |
| [Memory 10](../memory/plans/2026-10-09-memory-10-relevance-abstention.md) | Relevance abstention |
| [Memory 11](../memory/plans/2026-10-09-memory-11-code-identifier-retrieval.md) | Exact/subword code identifier retrieval |
| [Adaptive parallel tool execution](2026-10-09-adaptive-parallel-tool-execution.md) | Capacity-aware coordination for independent tool work |
| [Native tool registry](Native-Tool-Registry.md) | Registry tool Native dibangun sekali per proses dengan konteks per panggilan; tahap 0 (host dalam proses, tanpa server MCP) sudah selesai |


## Evidence and execution rules

- Proposed commands and acceptance criteria are future steps, not test results.
- Use synthetic fixtures and the plan's bounded verification scope. Production Memory, secrets, and unrelated runtime state are not test inputs.
- Provider configuration is not provider quality evidence. User-stopped provider probes and evaluation cohorts remain stopped.
- A plan's presence does not authorize implementation, installation, security changes, release, or deployment.
- Other domain plans retain their original paths. Start at [implemented systems and open proposals](../README.md) or [historical research](../archive/README.md) for their current classification.
