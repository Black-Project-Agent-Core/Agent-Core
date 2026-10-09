# Implementation plans and status

Status reviewed for source prerelease **`0.15.0-beta.0`**, based on implementation commit `f22e6e426d9c8937439763602f986b9fb3243f23`. The published source tag points to `23fdca411e152c42fe1a5b81f526b18d6d57bd3b`; this later status record leaves the tag unchanged. Source completion, verification, publication, and resident acceptance are tracked separately.

[Documentation](../README.md) · [Codebase map](../CODEBASE.md) · [Release notes](../releases/0.15.0-beta.0.md)

## Implemented source with remaining acceptance

| Plan | Source state | Outstanding acceptance |
| --- | --- | --- |
| [Memory 01: filtered semantic retrieval](2026-10-09-memory-01-filtered-semantic-retrieval.md) | Implemented; offline Memory checks and root build recorded | Further acceptance explicitly postponed by the user; Plan 02 remains unstarted |
| [Unified Workflows](2026-10-09-unified-workflows.md) | Implemented; Linux checks plus [isolated Windows/WebView2 functional PASS](../verification/workflows-windows-functional-2026-10-09.md) | Production activation; pointer-drag pan, broader security, exact subscription/non-overlap checks, and deferred benchmarks |

The Windows Workflows result applies to `f22e6e4` plus a three-file test-only launcher wrapper. It does not establish unmodified production launcher acceptance or Memory 01 acceptance. The original implementation checklists describe their recorded workflow. They do not override the status above or prove that a current Windows process loaded these changes.

## Proposed, not implemented

| Plan | Intended change |
| --- | --- |
| [Memory 02](2026-10-09-memory-02-controller-ranking-policy.md) | Controller ranking policy |
| [Memory 03](2026-10-09-memory-03-task-workspace-binding.md) | Host-validated task/workspace binding |
| [Memory 04](2026-10-09-memory-04-contextual-index.md) | Contextual index representation |
| [Memory 05](2026-10-09-memory-05-outcome-evaluation.md) | End-to-end outcome evaluation |
| [Memory 06](2026-10-09-memory-06-query-evidence-excerpts.md) | Query-focused evidence excerpts |
| [Memory 07](2026-10-09-memory-07-passage-retrieval.md) | Derived passage-level retrieval |
| [Memory 08](2026-10-09-memory-08-query-embedding-cache.md) | Bounded volatile query embedding cache |
| [Memory 09](2026-10-09-memory-09-subquestion-retrieval.md) | Bounded controller-led subquestion retrieval |
| [Memory 10](2026-10-09-memory-10-relevance-abstention.md) | Relevance abstention |
| [Memory 11](2026-10-09-memory-11-code-identifier-retrieval.md) | Exact/subword code identifier retrieval |
| [Adaptive parallel tool execution](2026-10-09-adaptive-parallel-tool-execution.md) | Capacity-aware coordination for independent tool work |

## Evidence and execution rules

- Proposed commands and acceptance criteria are future steps, not test results.
- Use synthetic fixtures and the plan's bounded verification scope. Production Memory, secrets, and unrelated runtime state are not test inputs.
- Provider configuration is not provider quality evidence. User-stopped provider probes and evaluation cohorts remain stopped.
- A plan's presence does not authorize implementation, installation, security changes, release, or deployment.
- Other domain plans retain their original paths. Start at [implemented systems and open proposals](../README.md) or [historical research](../archive/README.md) for their current classification.
