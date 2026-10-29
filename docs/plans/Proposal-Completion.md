# Agent Core proposal completion

Date: 2026-10-29 (Asia/Tomsk)
Status: COMPLETED — seven archives verified; folder/dashboard proposal counts zero.
Learning task: `ext-1ba3251efea14d1d8fc245c62706c629`

## Scope and acceptance

The user requests completion of all important proposals with Native Agent Core as partner, using Opus 5.5 at max effort. Completion requires no remaining proposal document under `docs/proposals` and no review item on the dashboard. Guides may remain. Moving an unfinished proposal or merely changing its status does not meet acceptance.

Preserve pre-existing working-tree changes, canonical state and history. Main owns implementation, integration and documentation. Native owns the assigned read-only preflight/review until explicitly reassigned. Use the existing owners and locations in `docs/PROJECT-STRUCTURE.md`; create no parallel storage. No release, commit, push or dependency installation is part of this task.

## Initial inventory and ordered slices

| Slice | Acceptance | Verification | Dependencies |
| --- | --- | --- | --- |
| 1. Inventory and Native preflight | Reconcile all six substantive documents, the incident Skill and five dashboard cards; distinguish open scope from closed history. Confirm actual Native model/effort. | Authenticated `/agent/proposals`, filesystem inventory, Native turn readback and source review. | None |
| 2. Harness2 | Resolve remaining P1/P2–P5 individually: existing behavior, smallest useful change, or evidence-backed no-op under each stated falsifier. | Focused Skill/evaluation tests, measured context evidence and owner mapping. | 1 |
| 3. Harness Lab | Resolve R8 archival/recovery and temporary-file scope without closing pending episodes or claiming unavailable task verification; resolve conditional experimental packages through their evidence gates. | Recovery/archival focused tests and bounded real-state inspection. | 1; 2 where evaluation shared |
| 4. Memory retention | Measure retrieval concentration versus explicit outcomes and current ranking/curation consumers; change scores only when evidence supports it. | Reproducible read-only aggregate and score comparison; focused tests if changed. | 1 |
| 5. Investigation quality | Complete P0 source map; choose projection-only or a bounded compatible extension; expose truthful scoped decision evidence in chat and preserve recovery/budgets. | Backend/transport/UI negative cases and deterministic paired acceptance. | 1; 3 for shared evaluation |
| 6. Incident Skill | Reconcile exact canonical revision and drift, build/activate through SkillService when justified, verify a historical postmortem and routing. | Parser/lint/decision/readback, inspect actual artifact and a grounded example. | 1; 2 structural warnings |
| 7. Activation and closure | Build affected owners, activate once when ready, verify resident behavior, finalize Learning, archive completed documents preserving evidence and repair links. | Core/UI/launcher checks as affected, resident readback, final filesystem/dashboard inventories with zero proposal items and warnings. | 2–6 |

Each slice remains open until its evidence is recorded. Conditional experiments do not require manufacturing a candidate or inventing a positive benefit. Their stop/no-op outcomes must be evaluated and documented rather than silently deferred.

## Source inventory and Replica application

This is maintenance and licensed source investigation, not an application clone. Replica recon is adapted to source inventory, flow/feature mapping and explicit uncertainty; the existing audit and this plan replace a new `replica/` storage tree.

| Original source | Scope and revision | License and disposition |
| --- | --- | --- |
| `https://github.com/google-research/harness2` | Google Research upstream verified live; prior bounded local audit pins `1cfe254e8d25b15f37048c3730134686abe60335`; `harness2/core/tree.py`, `ledger.py`, `prompts.py`. | Apache-2.0. Reuse ideas via existing SkillService, evaluation and handoff owners; no donor code copied or executed. |
| `https://github.com/karpathy/autoresearch` | Karpathy upstream verified live; prior local audit pins `228791fb499afffb54b46200aca536f79142f117`; `program.md`, `prepare.py`. | Prior README says MIT, separate license absent in inspected pin; no literal reuse. Controlled-experiment concepts only. |

Flow: source/failure evidence → one bounded owner change or no-op → independent check → existing decision/Learning → archive. No optimizer, evaluator, Memory store, daemon or model-training stack is introduced by this map.

## Recovery and evidence

## Investigation P0 decision

Observed: `decisionDeclarationSchema` already preserves immutable goals, context, predictions and registered-oracle evidence, but has no typed question, unknown assumption basis, alternative discriminator/falsifier or scoped parent relation. Native strategy and external Learning already share that exact schema/owner. `AgentChatService.getConversation()` returns SQLite chat data synchronously; the authenticated detail HTTP route and launcher forward its JSON unchanged. Task IDs already survive durable continuation and identify the same Learning record, so no checkpoint reference or duplicate inquiry store is needed.

Decision: add an optional, strict 4 KiB inquiry extension to the existing declaration and optional declared findings to assessments. Derive a bounded read model from the same task/workspace on the existing conversation detail route; preserve the synchronous service API for existing callers. No extra model/recall call, new MCP name, new database, scheduler, or checkpoint payload is required. Projection-only would leave the discriminator/falsifier relation in untyped free text and cannot satisfy the selected structured acceptance. An unavailable record remains unavailable and never implies a passed goal.

Fixtures: a settled task omits inquiry entirely and retains the existing path; an investigation records the question "Which transport lost the callback?", assumption "Credential is current", alternative "Factory dropped callback", discriminator "Direct works, HTTP fails", and falsifier "Both paths forward the same callback". Forecast immutability, cross-task parents, UTF-8 size and unknown fields are checked by focused tests. These are deterministic contract fixtures, not a model-quality benchmark.

- Pre-edit exact-file checkpoint: `925883b0-891b-4dac-ab3b-aa70191f01c6`; inspect a restore preview before any restoration. It inherits historical checkpoint metadata; only current target files are relevant.
- Native conversation: `f95d1b42-ef97-40b6-832e-abee637830a8`; first turn `937c47b7-057c-4c79-9491-1af3c65259f3`, idempotency key `all-proposals-opus-preflight-20261029-v1`.
- Native request persists `requestedModel=claude-opus-5-5`, `reasoningEffort=max`; runtime independently observed Opus 5.5 on the completed R8 and resident-inquiry turns. The original broad preflight exhausted its tool budget and was cancelled without claiming completion.
- Canonical Memory task: `4d37435e-07c3-4f45-b577-0ff0991c746a`.
- Final implementation and verification evidence belongs in `docs/verification/Proposal-Completion.md`.

## Final engineering disposition

All implementation slices are verified. Ten UP-09 existing reference candidates were additionally reconciled/promoted after their exact deltas and 29 tests were checked; this resolves residuals in the historical Claude donor roadmap rather than silently omitting them. Two bounded Native Opus5.5/max turns finalized with no-new-knowledge; Native goal verification remains unavailable. Main independently verified live inquiry projection, scoped negatives, hashes and health.

Conditional retention/archive changes stop on their documented falsifiers; speculative DARC/optimizer/model pilots do not become new pending requests. Original Native R4 closure and its inconclusive benchmark history are respected. Final Learning, readable archives, link repair and zero-queue verification complete slice7; their observed outcome belongs in the verification report.

Final readback: seven documents archived with matching move hashes, 105 local links resolve, recursive proposal document count0, authenticated dashboard review items0 and warnings empty. Two guides remain. Main Learning is reviewed complete/no-new-knowledge; detailed action ledger and evidence are in [Proposal-Completion.md](../verification/Proposal-Completion.md).
