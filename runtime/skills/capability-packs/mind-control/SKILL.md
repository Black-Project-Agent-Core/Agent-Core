---
name: mind-control
description: Default reasoning capability for every coding task and any other task that needs thought, judgment, inference, evidence appraisal, tradeoffs, planning, or uncertainty handling. Skip only non-coding work that is routine, deterministic, and requires no reasoning.
license: MIT
compatibility: Agent Core adapter with existing task grants. Local appraisal requires no network.
metadata:
  upstream-version: "1.5"
  origin: "K-Dense-AI/scientific-agent-skills"
  adapter-revision: "10"
  owner: "Ikbal and Claude Code (AI assistant)"
  author: "Ikbal and Claude Code (AI assistant)"
  copyright: "2026 Ikbal and Claude Code (AI assistant) for the adaptation and additions; 2025 K-Dense Inc. for upstream-derived material (MIT)"
  origin-proposal-id: "skill-proposal:a9a893d32b83c0aa4fc8130cb378ae42"
  origin-proposal-revision: "sha256:1859227f7f555daa339994b583c3e25567e4225cd1d766f5e116ab930c6be900"
---

# Mind-Control

## Triggers
- Every coding task.
- Any other task that needs reasoning, judgment, inference, tradeoffs, planning, debugging, evidence assessment, or uncertainty handling.

## Non-triggers
- Only non-coding work that is routine, mechanical, deterministic, and requires no reasoning or judgment.

## Procedure
Evaluate activation before topical relevance; choose depth below. Fix goal, scope and claim.
Source, tool observations, benchmarks, controlled failures and independently checked outcomes outrank
documentation and intuition. Separate facts, interpretations, assumptions and unknowns;
scoped validation from causal benefit; unavailable from negative evidence.

Run the user's five questions in order for non-trivial judgments:
1. **What do I actually know?** Separate verified fact, interpretation, assumption and unknown.
2. **What supports it, and what opposes it?** Actively seek evidence against my belief.
3. **What else could explain it?** Compare plausible rivals by the same standard.
4. **How can I test whether I am right?** Name the observation separating possibilities.
5. **What would change my mind?** State the falsifier and revise openly when it appears.

**Self-audit:** my own conclusion first: truth or justification?
**Frame:** right problem, goal and approach; could a simpler design work?
"It works" is not completeness: unexercised paths, real-use tests, instability?
Conclude clearly with reasons, fair contrary evidence, consistent comparisons,
uncertainty/boundaries and a testable, revisable conclusion.

Reuse Learning, Memory, decision review, verifier and SkillService. Reading is neither use
nor permission. Keep digest-bound read evidence; load references selectively. GRADE/RoB
are for research/clinical/statistical appraisal, not software. Narrative is not certainty.

## Proportionality and evidence record
Choose by stakes, uncertainty and reversibility (evidence_links_and_decisions.md section 6).
Escalate if a rival or consequence changes the decision.

| Tier | Use and output |
| --- | --- |
| T0 | Small, reversible, settled task: quick five-question check; no written record required. |
| T1 | Bug diagnosis, uncertain inference or design tradeoff: all six fields below, in order. |
| T2 | Contested claim carrying a material decision or irreversible/security-relevant action: T1 plus numbered reconstruction, explicit `#aux` premises and conclusion/objections. |

T0 changes record depth only; activation, authorization and required verification still apply.
Write concise evidence/decision summaries, never private reasoning or hidden scratchpads.
Use Native strategy/hypothesis or schema-valid `learning(action=decision)`, else the response.
Later answers may reference it. No new API fields or required tools. T2 appends reconstruction
after the six fields.

```text
Claim: decision and scope.
Observed: available facts and source.
Inferred: interpretation and missing assumptions.
Rival: strongest alternative and discriminating evidence.
Test: executed + result, or proposed + expected discriminator.
Flip condition: observation that changes the decision; confidence strong/moderate/weak/unknown with a reason.
```

T1 example; checks proposed, not executed:
```text
Symptom: tenant B sees tenant A's settings for the same account id.
Claim: the cache key likely omits tenant identity.
Observed: key=accountId; shared ids; wrong data clears after 60-second TTL.
Inferred: cross-tenant reuse fits; reproduction is not established.
Rival: a late asynchronous response overwrites the current tenant view.
Test: proposed A then B within TTL; inspect key/tenant, then reverse response order.
Discriminator: failure without overlap supports collision; reversed completion supports race.
Action: tenantId+accountId key; isolate namespace; cross-tenant regression check.
Flip condition: isolated keys fail only on reversed completion.
Confidence: moderate; collision fits, but a separate race remains possible.
```

## Argument reconstruction
For contested claims, rivals or multi-step inferences carrying a decision:
1. Sketch central claims and supports/objections, one sentence each.
2. Number premises, inference and conclusion; expose hidden premises as `#aux`.
   Separate intermediate/main conclusions, joint premises (all needed) and independent
   supports. Evidence sharing a source or flaw counts once.
3. Type objections: rebut the conclusion, undermine a premise, or undercut the warrant.
   Each needs a different check.
4. Check validity and premise truth separately. Fairly state the hidden warrant and test
   its rival; evidence fitting both does not establish the inference. Naming a fallacy
   points at verification; it does not refute a claim.
5. Compare hypotheses against evidence: consistent, inconsistent or not diagnostic.
   A comparison table is bookkeeping, not proof.
6. Judge links before the whole argument. Count unrefuted attackers, not objections;
   a claim stands only when attackers are defeated. Cycles stay undecided, not false.
   Check the disputed attack that would decide the issue first.
7. Name the flip condition and whether its test ran or is proposed. Stop checking and act
   when no cheaply checkable unknown would change the decision. Distinguish could/must/never;
   set the proof standard for exploration, reversible or irreversible action.
   Use ordinal confidence labels, not invented numbers.

## References and boundaries
Read relevant sections under `references/` only. No cited source tests this procedure on
LLM coding outcomes; measure benefit rather than assuming it.
- `question_map.md`: user's fifteen-question map, self-audit and frame checklist.
- `argument_reconstruction.md`: notation, labelling, flaky-test example and source strength.
- `fallacies_and_form.md`: validity/truth, fallacies, Mill's debugging methods, definitions.
- `evidence_links_and_decisions.md`: warrants, support independence, cycles and proof stakes.
- `scientific_appraisal.md`: upstream PICO/GRADE/RoB/ROBINS-I/QUADAS-3, critique, diagrams and
  citation request; only for research, clinical or statistical claims.
- Upstream detail: `scientific_method.md`, `common_biases.md`, `statistical_pitfalls.md`,
  `evidence_hierarchy.md`, `logical_fallacies.md`, `experimental_design.md`, `review_sources.md`.

No automated people scoring, unsupported clinical/policy advice, arbitrary Skill installation,
or unauthorized data collection/transmission.

## Ownership and attribution
Mind-Control's adaptation, procedure, Core questions and four added references belong to
**Ikbal and Claude Code (AI assistant)**, MIT. Appraisal text and eight upstream references
remain copyright 2025 K-Dense Inc., MIT; see unchanged `LICENSE` and `UPSTREAM.json`.
