# Package D: coding acceptance results

Date: 2026-10-26. Candidate adapter revision 9; baseline revision 8.

| Condition | Substance cases | Record v1 | Record v2 | Known input byte/4 estimate | Output byte/4 estimate | Orchestration seconds |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 3/3 (12/12 points) | 1/3 | 0/3 | 2787 | 1016 | unavailable; incomplete marker 97.2 |
| candidate-a | 3/3 (12/12 points) | 1/3 | 0/3 | 3358 | 1052 | 99.9 |
| candidate-b | 3/3 (12/12 points) | 2/3 | 1/3 | 3373 | 1124 | 82 |
| candidate-c | 3/3 (12/12 points) | 3/3 | 3/3 | 3396 | 1247 | 112.7 |

Candidate C passes the declared acceptance gate. Main manually scored substance; Raka independently corroborated the per-case criteria and v2 record scores. All raw outputs, failed wording versions, v1 rubric and timings are retained under `runtime/build/mind-control-cd-20261026/`. The machine-readable score/evidence and exact byte counts are in `results.json`.

The final body is 10,220 bytes (two 8,192-byte read fragments), versus 7,785 bytes in revision 8 and 21,993 bytes before package A. Package C adds 2,435 body bytes to revision 8; there is no additional token-saving claim for C. Trigger/non-trigger sections, all 13 references and LICENSE are byte-identical to resident revision 8.

## Interpretation and limitations

- Known input excludes host/system instructions, dispatch wrapper and tool envelopes. Token figures are ceil(UTF-8 bytes/4), not provider tokens.
- Case criteria were visible to both conditions. Cache case overlaps the worked example; cases informed revisions. No held-out or causal benefit claim.
- Single sample per case per version; same inherited host model/settings, exact identity unavailable.
- Case criteria were visible. Revisions used these acceptance cases, and cache overlaps the worked example. No held-out generalization or causal reasoning-quality improvement is established.
- Baseline already scored 12/12 substance; the observed change is record compliance.
- Provider tokens unavailable; text byte estimates exclude host/system and dispatch/tool envelopes.
- Times are dispatch markers to Main observation, including scheduling and delayed collection, not model latency. Exact baseline dispatch missing.
- Rubric v2 clarified T2=T1+reconstruction; earlier raw outputs were uniformly regraded, not rerun.
- T0 behavior and Native-provider effect were not benchmarked. Native partner review is separately recorded in the impact document.

The provider-token columns are unavailable, not zero. The displayed byte/4 estimates cover selected text only. No comparative latency claim is made. Output totals count response-body text and separators, excluding JSON envelopes.

## Revision 10 completion check (2026-10-27)

Revision 9 had completed C/D but missed the original proposal's one-fragment target.
Revision 10 compacts the complete procedure, tiers, six fields, worked example and seven
argument checks to 7,689 bytes including exact proposal provenance. The real SkillService
default-budget regression failed on revision 9 and passes on the compact candidate; live
delivery is checked separately at promotion. All 13 references and LICENSE remain unchanged,
and all eight moved scientific sections match the revision-7 backup byte for byte.

Raka's reused agent solved the same three cases without reading the grader or historical
responses during solving: 12/12 substance and 3/3 record compliance by Main's semantic
grading, with the third case's numbered auxiliary-premise reconstruction. Raw response:
`runtime/build/mind-control-cd-20261026/revision10-response.md`; reasons and excerpts:
`revision10-results.json`. Solve wall time 25 seconds; provider tokens unavailable.
Historical baseline/results above are preserved. This reused-agent regression is not a
fresh matched comparison and establishes no causal, general reasoning or Native benefit.
