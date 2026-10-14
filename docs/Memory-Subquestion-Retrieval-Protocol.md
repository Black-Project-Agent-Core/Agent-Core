# External controller bounded Memory subquestions — Batch 3

## Implementation scope (Windows, 13 October 2026)

An explicit controller_learning context retrievalPlan uses existing host-authorized canonical Memory, not a planner, new model, provider, ranking policy, or store. Source owners are subquestion-retrieval.ts, planned-memory-context.ts, external-controller.ts, agent-knowledge-synthesis.ts and the existing MCP controller-learning schemas/tools. Without retrievalPlan the legacy context v1 contract remains unchanged.

## Caller contract

1. Open an explicit host-bound episode using controller_learning(action=episode, episodeOperation=start, taskKey=stable-key, workspace=registered-workspace); use its actual returned taskId, not a manufactured selector.
2. Issue controller_learning(action=context) with taskId, query, and retrievalPlan containing version=1, rootQuery equal to query.trim(), and 2 to 4 unique questions [{id:q1,query}, {id:q2,query}] (optional q3/q4). The illustrated IDs are structural examples, not fabricated episode IDs.
3. Queries contain 1–2000 Unicode codepoints each; unknown plan fields and duplicate IDs/trimmed questions are rejected. limit defaults to 5 and is 1–8 hits PER recall. Invalid action/root/task/limit is rejected before work; legacy non-planned query can remain 4000 characters and 1–100 limit.
4. A missing/rotated/closed/unbound episode, mismatched owner, workspace or experience capability returns a blocked planned response; never fall back to context v1 or start an episode implicitly.

## Backend, resource and concurrency

The host creates one experience-v2 controller session via the existing canonical owner with fusion-feedback-v1 and createControllerMemoryDispatcher. Sequence is always root then each 2–4 subquery in submitted order, 3–5 total SERIAL memory_recall calls, abstract view, active-durable retention, no automatic expansion, retry, cursor continuation or sufficiency stop. Existing embedding may run per query; no new consent, provider, API key, or network configuration.

One response may use at most 4096 complete dispatcher-response bytes; the invocation reserves up to 32768 response bytes, at least 512 bytes per call, and a 15000ms monotonic deadline. The owner/session has a single-flight planned permit. Busy returns blocked/retrieval-busy. Abort/deadline only stop waiting/future dispatch, not a running backend: networkStopped=false and inFlightAtReturn/receivedBytesStatus describe unfinished work. The permit is held until outstanding backend settles. Scope is checked before each dispatch and before attribution; task drift discards invocation hits.

## Disclosure and attribution

ContractVersion 2 preserves sibling context, Skills, authority and Learning, but replaces legacy memories/contradictions with one memoryRetrieval. This carries exact memory ID/revision hits and origins, conservative freshness/verification/applicability, revision conflicts, question coverage, call summaries without raw query text, budget usage, stop reasons and omitted-hit count. Only the serialized memoryRetrieval block is limited to 32768 bytes; whole hits are dropped from the round-robin tail and coverage recomputed, never JSON/reference truncation.

Knowledge synthesis consumes the very same disclosure instead of silently refreshing one ID to a newer revision. Only finally disclosed origins are eligible for the existing deliveredMemories attemptId:id/contentDigest map. Conflicting digest keys are not overwritten. Exposure is not use or verified benefit: existing artifact_receipt and Memory-feedback prerequisites remain in force. Neither retrieval nor binding proves truth, sufficiency, permission, evidence-review or quality gains. Audit events omit raw planned query and body.

## Donor and boundaries

This is a native adaptation of #25 SimpleMem, pinned db80b6a7c591e0ea730a058e9f5fc4eb06572299 (MIT, AIMING Lab). No donor Python/LLM planner/vector store, distributed execution, reflection/replay, parallel recall, extra canonical root, or new Memory engine. #47 Grok Build lexical MMR remains deferred outside Batch 3. No existing global tokenizer/ranker/threshold is modified.

## Rollout evidence boundary

Source implementation and successful official Windows build are distinct from resident Node activation and refreshed external ChatGPT custom-plugin schema. Do not describe retrievalPlan as available to the connected client until actual tools/list or the refreshed plugin exposes it. Operational use must have an actual host-bound task, never a fabricated ID or synthetic receipt.

