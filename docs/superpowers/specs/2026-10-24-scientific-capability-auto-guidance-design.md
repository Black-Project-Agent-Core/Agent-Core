# Scientific capability auto-guidance design

## Intent
Make `scientific-critical-thinking` the default cross-session reasoning capability for both Native and external controllers while retaining a compact always-exposed descriptor and selective reference loading.

## Current state
The three specialized Skills are active in SkillService. Their current source locator, corrected on 2026-10-27, is `runtime/skills/capability-packs`, inside the original Skill home; the dated design evidence below remains historical. Before this correction, the scientific route was always advertised but described only as a consequential-claim relevance candidate, which could suppress ordinary reasoning tasks.

## Chosen approach
Add a lightweight `scientific-critical-thinking` route to shared `taskSkillGuidance`. It exposes installation status, the activation gate, and an exact digest-bound read request on every task/session. The gate is evaluated before topical relevance: controllers inspect and progressively read the full active Skill for every coding task and every other task that requires reasoning or judgment, including standard and non-scientific work. Only routine deterministic non-coding work with no reasoning skips the body; references remain selective.

## Alternatives considered
- Keep index-only routing: cheapest, but weaker than the user's explicit auto-active requirement.
- Inline the full Skill on every task: strongest exposure, but wastes tokens and conflicts with selective capability loading.
- Add a second registry or scheduler: duplicates existing SkillService ownership and is unnecessary.

## Constraints
Preserve current grants, cancellation, SkillService ownership, versioned active revisions, and capability-pack layout. Promote only the revised index and scientific Skill digests. Do not install sibling scientific Skills or new dependencies.

## Verification
A regression test must fail before implementation, then prove external bootstrap, external task context, and Native guidance all expose the exact scientific digest without embedding a marker from its body. Run focused guidance tests, the related capability suites, build, official restart, and resident readback.
