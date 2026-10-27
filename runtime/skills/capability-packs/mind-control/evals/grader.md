# Coding microbenchmark grader

Freeze this rubric and cases.json before collecting either condition. One fresh-context
subagent receives revision 8 and all three independent cases; a second fresh-context
subagent receives the candidate and the identical cases. Neither sees the other output
or this grader. Same inherited host model/settings; no execution tools during solving.
Record any model/settings fields the host exposes; unavailable token counts stay unavailable.

For each case, manually award one point for each of its four criteria only when the
response contains substantive supporting content. Quoting an instruction or section label
does not earn credit. Contradictory claims cancel the affected point. A case passes only
with 4/4 substance points and no invented execution, benchmark, certainty or safety proof.
Record the evidence excerpt and reason for every score. Never use keyword presence as
the semantic grader. Preserve raw responses, including negative results.

Rubric version 2 clarifies the T2-plus-T1 requirement after partner review. Preserve v1 and
regrade all earlier raw outputs uniformly under v2; do not report regrading as a new run.

Score package-C compliance separately: all three cases use a compact six-field record
(Claim / Observed / Inferred / Rival / Test / Flip condition + ordinal confidence, or
faithful translations), with ordinal confidence and a reason. Case 3 additionally uses T2
numbered premises, an explicit missing auxiliary premise and a conclusion/objection.
T2 reconstruction does not replace the six-field record. A justified T2 for case 1 is acceptable
only if all six information fields remain identifiable. Never require hidden reasoning:
these are concise evidence/decision summaries. T0 is for small reversible tasks and
does not waive the activation gate, required verification or existing authority.

Measure condition wall time from dispatch to received response; it includes host latency
and scheduling. Report actual provider tokens only when exposed. Also report exact UTF-8
input/output bytes and ceil(bytes/4) estimates, explicitly distinguished from provider
tokens. Do not call a byte estimate a measured token saving.

Promotion gate: candidate passes all three substance cases with no per-case regression,
and all three output-shape checks pass. A baseline already at ceiling is retained and
reported; it does not establish a reasoning-quality improvement. This one-sample-per-case
microbenchmark is a bounded acceptance check, not a statistical/causal result, a latency
benchmark or evidence about Native provider behavior. Native partner review is separate.
The cache case overlaps the candidate's worked example, and these cases informed wording
revisions; they are acceptance cases, not held-out transfer evidence. Improved format alone
does not demonstrate improved reasoning. T0 behavior is not exercised by these cases.
