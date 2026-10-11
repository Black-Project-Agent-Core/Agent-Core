# Implementation plans and status

Source candidate **`0.15.0-beta.3`**. Source implementation, offline verification, published artifact and resident acceptance are separate gates. User authorization covers Memory Plans 12–21 in the existing Linux source; Windows alignment of the earlier beta.2 remains separate. Performance benchmarks are deferred; no provider or automatic production re-embedding approval is inferred.

[Documentation](../README.md) · [Codebase](../CODEBASE.md) · [Candidate notes](../releases/0.15.0-beta.3.md)

## Implemented and accepted predecessor scope

[Memory01](2026-10-09-memory-01-filtered-semantic-retrieval.md) and [Workflows](2026-10-09-unified-workflows.md) have [reviewed Windows functional acceptance](../verification/memory01-windows-functional-2026-10-10.md). Do not repeat closed acceptance without a new regression reason.

## Current source candidate

| Plan | Implemented scope | Rollout boundary |
| --- | --- | --- |
| [Memory02](2026-10-09-memory-02-controller-ranking-policy.md) | Host-owned opt-in fusion/feedback and stable revision-bound pagination | Default remains baseline; relevance gain not established |
| [Memory03](2026-10-09-memory-03-task-workspace-binding.md) | Credential-owner and registered-workspace task binding, explicit v2 selector | External clients must update envelopes; Learning task groups remain serialized |
| [Memory04](2026-10-09-memory-04-contextual-index.md) | Title-aware document v2 and derived index v3 | Automatic startup re-embedding needs provider/data/volume/cost approval |
| [Memory05](2026-10-09-memory-05-outcome-evaluation.md) | Isolated deterministic outcome harness and evidence verification | Synthetic results do not prove model benefit; live gate remains separate |

## Memory06–11 source implementation

Final integrated evidence is recorded in the [functional source ledger](../verification/memory06-11-source-functional-2026-10-10.md). Passage granularity, query caching and relevance policy remain host-only opt-ins, disabled by default.

| Plan | Implemented change |
| --- | --- |
| [Memory 06](2026-10-09-memory-06-query-evidence-excerpts.md) | Query-focused evidence excerpts |
| [Memory 07](2026-10-09-memory-07-passage-retrieval.md) | Derived passage-level retrieval |
| [Memory 08](2026-10-09-memory-08-query-embedding-cache.md) | Bounded volatile query embedding cache |
| [Memory 09](2026-10-09-memory-09-subquestion-retrieval.md) | Bounded controller-led subquestion retrieval |
| [Memory 10](2026-10-09-memory-10-relevance-abstention.md) | Relevance abstention |
| [Memory 11](2026-10-09-memory-11-code-identifier-retrieval.md) | Exact/subword code identifier retrieval |

## Proposed, not implemented

| Plan | Intended change |
| --- | --- |
| [Adaptive parallel tool execution](2026-10-09-adaptive-parallel-tool-execution.md) | Capacity-aware coordination for independent tool work |


<a id="memory-reference-adoption"></a>

## Memory12–21 reference adoption source work

**Source candidate `0.15.0-beta.3`; final functional evidence is in the [source ledger](../verification/memory12-21-source-functional-2026-10-11.md).** One reference per plan, with distinct responsibilities rather than ten new memory subsystems. Read the [shared specification and dependency map](2026-10-11-memory-reference-adoption-spec.md) for the implementation boundaries. The source research uses pinned upstream commits; incomplete donor features and license limits are documented per plan. This source work does not perform or replace the user’s separate beta.2 Windows installation alignment.

| Plan | Reference | Unique scope | Category |
| --- | --- | --- | --- |
| [Memory12](2026-10-11-memory-12-anthropic-session-continuity.md) | Anthropic | Controller checkpoint/resume compliance | Incremental |
| [Memory13](2026-10-11-memory-13-memu-capture-commit-recovery.md) | memU | Durable capture receipt and cursor recovery | Incremental |
| [Memory14](2026-10-11-memory-14-graphiti-known-at-history.md) | Graphiti | validAt plus knownAt historical knowledge | New bounded capability |
| [Memory15](2026-10-11-memory-15-hindsight-evidence-synthesis.md) | Hindsight | Evidence-dependent project synthesis | Incremental candidate |
| [Memory16](2026-10-11-memory-16-ace-bounded-curation.md) | ACE | Bounded lesson/playbook curation and counterexamples | Incremental |
| [Memory17](2026-10-11-memory-17-openai-memory-compaction.md) | OpenAI Cookbook | Compaction content integrity and promotion boundaries | Incremental |
| [Memory18](2026-10-11-memory-18-pm-bench-prospective-intentions.md) | PM-Bench | Condition-based deferred intention candidates | New bounded capability |
| [Memory19](2026-10-11-memory-19-realm-reconsolidation-experiment.md) | REALM | Outcome-driven relationship proposals in fixtures | Offline experiment only |
| [Memory20](2026-10-11-memory-20-longmemeval-functional-evaluation.md) | LongMemEval | Recall/update/temporal functional diagnostics | Evaluation only |
| [Memory21](2026-10-11-memory-21-memprobe-memory-integrity.md) | MemProbe | Interference/misinformation/consolidation diagnostics | Evaluation only |

Priority is incremental continuity and historical correctness, followed by evidence synthesis/learning. Plan 19 does not authorize production changes. Plan20 owns the shared diagnostic extension used by Plan21. The original proposed checklists remain planning history; only the linked ledger and verified logs establish passed results. Source implementation has one additive minor intent and advances the existing prerelease train to beta.3; no release/activation is implied.

## Evidence and execution rules

- Proposed commands and acceptance criteria are future steps, not test results.
- Use synthetic fixtures and the plan's bounded verification scope. Production Memory, secrets, and unrelated runtime state are not test inputs.
- Provider configuration is not provider quality evidence. User-stopped provider probes and evaluation cohorts remain stopped.
- A plan's presence does not authorize implementation, installation, security changes, release, or deployment.
- Other domain plans retain their original paths. Start at [implemented systems and open proposals](../README.md) or [historical research](../archive/README.md) for their current classification.
