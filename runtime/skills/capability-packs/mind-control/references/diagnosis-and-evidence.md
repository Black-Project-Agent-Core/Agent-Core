# Diagnosis and Evidence

Read for contested conclusions, uncertain causes or consequential decisions.

## Reconstruct an argument

Identify the claim and scope. List only decision-relevant premises, marking unstated assumptions as `#aux`. Check whether the inference follows separately from whether the premises are true. For deductive claims inspect validity; for probabilistic claims inspect evidential strength and plausible confounders. Classify objections as a rebuttal of the conclusion, an attack on a premise, or an undercutting of the inference. Resolve links before summarizing the whole argument.

Do not confuse intention with causal mechanism, temporal order with causation, or absence of recorded errors with successful execution. An incomplete log cannot prove an event never happened. A benchmark without baseline, workload and environment cannot establish improvement. Inspect whether a source actually measures the relevant outcome and whether its selection process biases the result.

## Evidence ledger

For material claims retain: claim; source locator; version/date/environment; observation; limitations; conflicting evidence; next discriminating check. Keep it task-local unless a durable write is authorized. Exclude secrets and irrelevant personal data. Distinguish the source's publication date from the date of the event or experiment.

When evidence conflicts, check whether sources describe the same version, population, configuration, time and metric. Inspect missingness and corruption. Explain the unresolved conflict rather than selecting whichever supports the preferred answer. Agreement between agents or repeated model outputs is not independent empirical evidence.

## Five Whys without invented certainty

Start with an observed symptom. For each proposed cause, identify supporting evidence, a competing explanation, and the next check. Branch when multiple causes are plausible. Stop at an actionable supported cause or a specific evidence gap; five is a mnemonic, not a quota. Distinguish proximate cause, contributing condition and systemic cause. Never invent motives or blame a person simply because the investigation reaches an ownership boundary.

## Five Hows without an implementation leap

Start from the desired outcome or a supported cause. Ask how a candidate remedy would work, then how its dependencies and interfaces would work until a concrete next step emerges. If the cause is uncertain, make that step diagnostic. Compare a minimal change, an alternative workflow and a redesign where appropriate. Trace each step to a purpose; remove steps that add no evidence or needed capability.

## Bounded experiment card

```text
Hypothesis and credible rival:
Observation that distinguishes them:
Baseline and controls:
Input, environment, version and dependencies:
Expected result under each hypothesis:
Success / failure / inconclusive criteria:
Authorized actions and prohibited side effects:
Cost, time and resource limits:
Containment, cleanup and rollback where applicable:
Stopping rule:
Actual result and deviations: NOT RUN until executed.
What the result does and does not prove:
```

Prefer an informative low-risk check over a dramatic stress test. Use representative fixtures and independent outcome assertions. For stochastic behavior report variation and sample limits; do not replace variability with a single best run. Expand testing only when expected information justifies its cost and permission exists.

## Failure and completion discipline

Track the exact failed action, target, observed error, effect status and missing prerequisite. Do not assume a timed-out write failed: check its outcome before retrying. Never use another route to evade a denial. If the same approach yields no new information, change strategy or identify the blocker.

Conclude at the appropriate scope: “selection branch passed in an isolated fixture” is useful; “routing is universally correct” is not supported. Escalate depth with consequences and uncertainty, not with rhetorical demands for perfection.

## Q1–Q8 coverage in deep reviews

Use a small task-local record when complexity warrants it:

| Stage | Finding to establish | Exit criterion |
| --- | --- | --- |
| Q1 | Precise claim, symptom, variables and boundary | The competing explanations concern the same problem |
| Q2 | Outcome, acceptance, value and anti-goals | Success can be assessed without substituting a proxy |
| Q3 | Evidence, reliability and limitations | Important claims have a source or an explicit unknown |
| Q4–Q5 | Assumptions and inference links | Material gaps and unsupported jumps are visible |
| Q6–Q7 | Strongest rival and discriminator | A meaningful observation could change the choice |
| Q8 | Consequences, verification and next action | Scope, residual risk and stopping conditions are clear |

An exit criterion may be “unknown and blocking,” not an invented answer. User-facing evidence summaries can be much shorter than this table.


## Controlled updates

Revisit a stage only when a new observation, meaningful counterexample or unresolved high-impact assumption warrants it. Record what changed, which conclusion is affected and the next useful discriminator. Do not repeat identical searches or rewrite the same rationale as “deeper reasoning.” A timeout after a side effect requires checking outcome before retrying. A denied action is a boundary, not an invitation to find a bypass.

Stop when acceptance is evidenced and remaining uncertainty cannot materially change the decision, when the authorized budget is reached, or when essential evidence/approval is unavailable. Report bounded success or the exact blocker. Do not silently convert an inconclusive experiment into a passing result.

