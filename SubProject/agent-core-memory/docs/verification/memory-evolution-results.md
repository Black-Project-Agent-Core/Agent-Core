# Lifecycle evaluation T8: reproducible evidence

**Implementation and verification complete, 7 October 2026 UTC. G8 independent evaluation review passed at 21:58 UTC.**

This report uses only synthetic roots. The engine baseline is
`685195c3f1aed8347b29e4551df739126abeec86`. The sealed corpus is
`memory-lifecycle-v1`, SHA-256
`cfc39180e9cf32080b96c773b13b649b48da797d4fa992f40839e317546d496b`.
No threshold or workload was adjusted after measurements.

## Initial failed performance gate, retained

The [initial isolated 8-test dataset](memory-evolution-initial.json) records the first run. Its then-existing functional assertions passed; the later G8 review found oracle/accounting gaps described below. At 1,000 records,
facade lexical discovery nevertheless failed the predeclared section 12 guard:
median **3.8796×** baseline, p95 **3.5606×**, versus limits **1.20× / 1.30×**.
Legacy median was 808.28 ms; facade median was 3,135.83 ms. Smaller emitted
payloads do not turn this latency failure into a pass.

The 300-event full-history workflow emitted 331,763 bytes in eight calls;
capsule plus the same original evidence emitted 8,099 bytes in two calls.
Those original trials checked eight independently authored evidence-backed
items, the pending obligation, next action and original byte hash. Complete goal
metadata/identity coverage was missing until the G8 correction below. Read medians were 6,783.65 / 532.43 ms. These are local API wall times, not
network/model latency or a universal percentage-saving promise.

A separate pure-function diagnosis reproduced the dominant cost:
`selectTemporalCandidates` made 100, 10,000 and 1,000,000 `structuredClone` calls
for 10, 100 and 1,000 records. The 1,000-record selector alone took
2,648.98 / 2,707.11 / 2,648.81 ms in three uninstrumented samples. The
invalidator pair scan cloned metadata before checking whether it was dynamic,
even when there were no temporal links. This is additional diagnostic evidence,
not a replacement for the original failed guardrail run.

A separately authorized narrow optimization filters relevant link owners once
and compares existing v2 temporal fields without cloning per pair. It retains
inactive historical invalidators and unchanged scope, epistemic, equal-time and
conflict behavior. Deterministic operation-count regression tests were observed
failing before the repair, then all 75 temporal/regression cases passed. Final
post-fix sealed measurements and aggregate verification are recorded below.

## Oracle, workload and interpretation

The independent expected answers were authored before executing the evaluated
engine. Fixtures are versioned and byte-sealed in
[the corpus](../../tests/fixtures/memory-lifecycle/README.md). The evidence artifact UUID is
bound only after checking captured original bytes against the sealed SHA-256.
The goal UUID is separately bound once from the validated initial episode.
Whole mandatory objects, refs and verification labels are compared; a returned
engine score, digest of a generated answer, or reused ledger is not the oracle.

Two explicit negative commands exited 1 for the intended failures: removing a
mandatory constraint and fabricating a source revision. The normal suite also
corrupts real engine-returned capsule items and confirms rejection, and rejects
an unsupported assertion or altered original bytes. Natural-language inference
outside this sealed corpus remains unproven.

- Real public capture, start, append, reviewed promotion and archive operations
  construct roots with 10 and 300 events. Counts include start/state/promotion.
- Full-history reads use a 512-byte discovery handle, paged exact episode, and
  selected original evidence. Capsule reads use full task context and the same
  selected evidence. They use the same root and requested operational answer.
- Legacy lexical and facade queries use identical top-1 target labels at
  10/100/1,000 records. The latency guard compares lexical discovery; full
  selected-record answer cost also includes every expansion response/call.
- Two warmups are separate from 11 history and 31 lexical measured trials.
  Mode order alternates. Timing uses monotonic `performance.now`; p95 uses
  nearest-rank `ceil(.95*n)` (thus the maximum of 11 history samples).
- Setup/checkpoint, warmups, read trials, auxiliary checks, diagnostic reads and
  index rebuild are separately counted. Bytes include complete serialized JSON
  response envelopes, not requests, transport framing or filesystem I/O.
  Host service construction/restart each occurs once per lifecycle root; these
  return service objects, not context payloads, and their elapsed time is separate.
  Response-call counts cover methods returning serializable data, not internal
  filesystem calls or host object construction.
  Cross-scope rejection is a direct thrown API error; its attempted call is
  recorded separately, and unknown transport encoding is not reported as zero.
- Every bounded success/partial response is checked against the actual UTF-8
  byte count and requested maximum. Token counts use Unicode-codepoints/4;
  there is no model tokenizer or actual model cost. Models: NOT RUN, zero calls,
  token/cost fields null.
- Duplicate-context rate counts repeated exact labeled mandatory text only, a
  lower bound of textual duplication, not a semantic-redundancy measure.
- Archive success has an actual independently labeled rank and reconstructable
  record -> source event -> original evidence path. One target per fixture is
  not a broad relevance benchmark. Missing-query, injection, cross-scope and
  insufficient-budget cases exercise real boundaries.
- Proposed next action is reconstructed, not executed. Benchmark outcome is
  UNAVAILABLE. Separate E26 tests distinguish exposure, reported use, verified
  associated outcomes, unrelated evidence and causation that is not established.

## Status boundaries

All E01–E32 cases have explicit proof selectors or an unrun scope in
[the acceptance matrix](../../tests/fixtures/memory-lifecycle/cases.json).
A selector must match executed passing assertions; a file or E-number does not
count as a pass. Supplemental section 12 regressions include semantic-only and
access-only revisions, more than eight revisions, >4,000 receipts, >512 feedback
rows, 64-input/65-accumulated refs, 16 evidence refs per link and 65 distinct links,
index deletion/rebuild, failed visibility and reads concurrent with apply.

E04 final transfer/publication boundary, E23 transfer/2, E25 live action choice,
E28 final transfer preservation, E29/E30 controller continuation, E31 live model
step and E32 Windows retain separate PARTIAL/NOT RUN statuses. Existing Linux
locking or newline tests are not evidence of Windows execution. No credentials,
user data, Windows operations, release or deployment were used.

NOT RUN means not attempted; SKIPPED means skipped by the runner; UNKNOWN means
truth/applicability/freshness is not established; UNAVAILABLE means a requested
source or outcome cannot be accessed or verified; PARTIAL means not all required
proof exists. These are not interchangeable with PASS.

## Reproduction

See the corpus README for negative controls and commands. `npm ci --ignore-scripts
--offline` from the approved npm cache in a separate clean root installed 57
packages and `npm run build` exited 0. The dependency lockfile was unchanged.
Node 24.19.0, npm 11.9.0, Linux x86_64. The existing npm `http-proxy` environment
warning was retained in logs; no global configuration was changed.

Final aggregate counts, storage, matrix statuses, command exits, package boundary,
source hashes, post-fix performance and remaining gates are below and in the
[machine-readable result](memory-evolution-results.json). The [initial isolated dataset](memory-evolution-initial.json) preserves the exact 3.8796× / 3.5606× failure; the distinct [corroborating pre-fix dataset](memory-evolution-baseline.json) preserves the later 3.7136× / 3.2765× run and its concurrency caveats. Both retain their original raw phase rows, including the historical accounting defect; neither is silently repaired or replaced by a rerun.

## Scoped optimization review

The independent source review accepted only the bounded optimization, not G8.
Reviewed source SHA-256:
`72b52272c85ea4e5445303c535cb0ebdcbfd51fc98bd1647916291b336bc029b`;
focused regression test SHA-256:
`ccf664a7d2e0a9d4334a289bbcc15a8ce73094efd413df9e95b68e1553727c9b`.
After repair, the separate selector diagnostic counted 10/100/1,000 clones,
with 1,000-record uninstrumented samples of 3.58/3.67/4.19 ms. No assertion
claims linear complexity for dense linked graphs: those can still perform
pairwise or nested endpoint work. End-to-end acceptance is reported separately.

The link-bound fixture preserves opaque legacy `evidenceRefs` strings without
calling them available or verified. Fabricated **typed SourceRef** rejection is
exercised separately at capture/append/promotion/disclosure boundaries. Legacy
string provenance is not converted into independently checked evidence by this
evaluation.

## G8 review corrections and fresh verification

F1: the prior oracle checked only goal text/state/status. It now validates the
complete independently specified goal, including critical=true, empty provenance
and exact unverified/empty evidence. A valid runtime UUID is bound once from the
initial episode and compared on every checkpoint/history/capsule candidate.
Negative controls cover fabricated source/evidence refs, weaker flags, extra
verification fields, wrong/unbound/invalid identity, omission and duplicates.

F2: earlier meter summaries shared a live response array. Their discovery numeric
bytes/calls were correct, but response rows later included selected expansion.
Current summaries copy arrays and rows, and report generation rejects any row-sum
mismatch. Original historical datasets remain unchanged and explicitly carry this
limitation; new phase evidence is produced only by fresh measurements.

F3: the exact original initial dataset is now committed byte-for-byte separately
from the corroborating dataset. Their different ratios, seals and provenance are
identified rather than presented as one run. No workload or threshold changed.

Three new regressions reproduced F1/F2 as expected failures before the helper
repairs; bounded tests passed afterward. No engine source or optimization changed.
Fresh isolated rerun: 13/13, exit 0, 234.75s. Fresh aggregate build/full suite:
455/455 across 22 files, exit 0, 254.42s; zero failed/pending/todo. All 380 phase
snapshots reconcile their response rows; each history/capsule candidate checks
nine mandatory objects, including the bound goal. Fixed latency guards pass in
both runs. Engine source-tree, corpus and threshold hashes are unchanged; the
revised harness/source hashes and command exits are recorded in current JSON.
G8 remains pending independent re-review.

Historical dataset identity is explicit:

- [Initial isolated run](memory-evolution-initial.json): original 31-trial JSON,
  byte-identical to the original artifact, SHA-256
  `ab8759175fa40724696e0a02c49b0a6c0f7eb0125ae140cafb136f23176d937c`.
  Its 1,000-record ratios are 3.8796153555× median / 3.5606176121× p95.
- [Corroborating run](memory-evolution-baseline.json): unchanged from the prior
  committed blob, including concurrency/source caveats. Its distinct ratios are
  3.7136152423× / 3.2765377750×.
- Both historical files retain the original response-row aliasing defect. Use
  their recorded numeric phase totals, not the inconsistent discovery row lists.
  The current report rejects that inconsistency and comes from fresh execution.


## Final verified run

- Build + full verification: **455/455 tests in 22 files**, exit 0; 0 failed, 0 pending, 0 todo. Previous reviewed T7 baseline: 438/438.
- Final isolated lifecycle suite: **13/13**, exit 0. The full suite independently repeats it. Intentional oracle RED commands each exited 1 for their intended assertion; selected-only runs are explicitly separate from full counts.
- Engine source-tree digest: `70fae02b908bba8903a9f05b334dba7881a9e0d386b84c26fd77033be0dd0a29`; harness digest: `f7bf79467b3794d0223d9a7ce56b28017b8497c69d74e212e7c0df01b8fc3c1c`. Tested engine commit `76dfcf8dbcbe8a1a52d31dab44aa4462f6ee7e47` already contains the accepted temporal optimization. The revised harness is identified separately by hash, avoiding a self-referential report commit hash.
- Dataset `memory-lifecycle-v1`, lockfile SHA-256 `f6e124f787c9b5958bdb2bcd13a1076a8018be525b40c75458f4b0b65db03505`. Exact toolchain, start/end timestamps, command exits and each reused test-source hash are in the JSON report.
- Package dry-run: 284 files, 385,073 compressed bytes, 2,026,578 unpacked bytes; forbidden paths empty. Boundary and clean Linux build passed. No dependency/lock changes, raw user traces, credentials, external mutations, release, deployment or Windows claim. G8 still requires the parent’s independent evaluation review.

### Hard gates and scope

- hardCorrectness: **PASS (executed deterministic boundaries only)**
- noInvention: **PASS (sealed corpus only)**
- budget: **PASS (executed bounds only)**
- efficiency: **PASS**
- latency: **PASS**
- continuity: **PARTIAL: offline engine replay passed; T9 protocol/live controller and Windows NOT RUN**
- storage: **REPORTED; no automatic purge threshold**
- G8: **PENDING REVIEW**

### Same operational answer, full history versus capsule

| Events | Mode | Median emitted bytes | Calls per trial | Median ms | p95 ms | Exact mandatory/obligation/evidence |
|---|---|---:|---:|---:|---:|---|
| 10 | Full history + evidence | 24,284 | 3 | 121.29 | 144.78 | PASS |
| 10 | Capsule + evidence | 8,096 | 2 | 52.81 | 70.29 | PASS |
| 300 | Full history + evidence | 331,763 | 8 | 6829.13 | 7530.51 | PASS |
| 300 | Capsule + evidence | 8,099 | 2 | 557.29 | 635.19 | PASS |

Setup and checkpoint are explicit additional costs:

| Events | Setup bytes / calls | Setup elapsed ms including checkpoint | Checkpoint bytes / calls / ms | Restart ms |
|---|---:|---:|---:|---:|
| 10 | 9,170 / 16 | 541.37 | 6,677 / 1 / 75.38 | 4.83 |
| 300 | 79,261 / 306 | 51187.78 | 6,678 / 1 / 701.34 | 6.61 |

Setup response bytes/calls exclude checkpoint; the setup elapsed total includes it, so do not add checkpoint elapsed again. Warmup, auxiliary, diagnostic and index-rebuild calls are separately enumerated in JSON. All measured history trials deep-fetch original evidence (rate 1.0). Exact repeated-labeled-text duplicate rates and omitted supporting IDs are also retained; no semantic compression claim is inferred.

### Warm lexical guard and complete selected-answer cost

| Records | Legacy median / p95 ms | Facade discovery median / p95 ms | Median / p95 ratios | Guard | Selected full-answer median ms |
|---|---:|---:|---:|---|---:|
| 10 | 21.24 / 26.36 | 7.82 / 9.62 | 0.3682 / 0.3648 | PASS | 18.55 |
| 100 | 88.86 / 106.08 | 40.04 / 48.92 | 0.4506 / 0.4611 | PASS | 99.43 |
| 1000 | 779.43 / 876.71 | 357.40 / 426.83 | 0.4585 / 0.4869 | PASS | 929.93 |

| Records | Legacy bytes / calls | Discovery bytes / calls | Discovery + all selected expansions bytes / calls |
|---|---:|---:|---:|
| 10 | 10,092 / 1 | 1,489 / 1 | 5,756 / 2 |
| 100 | 10,093 / 1 | 1,489 / 1 | 5,756 / 2 |
| 1000 | 10,094 / 1 | 1,489 / 1 | 5,756 / 2 |

Thresholds stayed 1.20× median / 1.30× p95; the original 1,000-record FAIL was repaired, not reclassified. Every selected full-answer trial checks the full original target content. Discovery UNKNOWN applicability remains uncertainty; a relevant rank does not make the record a verified fact.

### Storage, not a purge policy

| Records | Initial empty-root bytes | Pre-read bytes | Incremental bytes/record | Post-read/rebuild bytes | Snapshot ref/object ratio | Index rebuild ms |
|---|---:|---:|---:|---:|---:|---:|
| 10 | 1,541 | 115,003 | 11346.20 | 352,640 | 1.00 | 11.23 |
| 100 | 1,541 | 1,135,153 | 11336.12 | 1,372,946 | 1.00 | 41.10 |
| 1000 | 1,541 | 11,341,153 | 11339.61 | 11,579,152 | 1.00 | 672.87 |

The 10-event root used 148,626 bytes before read trials (14862.60 bytes/event) and 208,289 afterward.

The 300-event root used 9,341,896 bytes before read trials (31139.65 bytes/event) and 9,485,643 afterward.

The ratio is manifests with objectDigest divided by distinct referenced object digests, not a compression ratio. Record growth uses real public batch writes (chunks <=100), not sequential single-write throughput. Per-directory bytes are preserved in JSON. Process RSS/heap are an end-of-file sample, not a peak or a causal per-mode allocation comparison.

### Executed acceptance matrix

| Case | Status | Boundary / remaining scope |
|---|---|---|
| E01 | PASS | Clean Linux dependency resolution/build |
| E02 | PASS | Existing suite before and after |
| E03 | PASS | Empty root persistence across processes |
| E04 | PARTIAL | Package and extraction boundary; T9 final transfer/publication boundary NOT RUN |
| E05 | PASS | Idempotent event and conflict |
| E06 | PASS | Crash/restart unresolved state |
| E07 | PASS | Success applicability and failure lineage |
| E08 | PASS | Invalid promotion never mutates canonical |
| E09 | PASS | Real killed process and replay |
| E10 | PASS | Near duplicate constraint distinction |
| E11 | PASS | Mandatory exact capsule items |
| E12 | PASS | Explicit insufficient budget |
| E13 | PASS | Compact discovery to selected record, episode and evidence |
| E14 | PASS | Live source freshness |
| E15 | PASS | Computed proposal stale CAS |
| E16 | PASS | Archived successful experience reconstructable |
| E17 | PASS | Same workload bytes calls latency correctness |
| E18 | PASS | Dynamic current/asOf answers |
| E19 | PASS | Reverse and intra-batch ingestion |
| E20 | PASS | Epistemic and scope non-invalidation |
| E21 | PASS | Temporal invalid/cycle/partial/timezone |
| E22 | PASS | Equal-time conflict remains conflict |
| E23 | PARTIAL | Legacy and typed temporal roundtrip; T9 transfer/2 import/export NOT RUN |
| E24 | PASS | Capture, consolidation, disclosure injection |
| E25 | PARTIAL | Current correction versus advisory remembered instruction; T9 live controller action choice NOT RUN |
| E26 | PASS | Exposure/use/associated outcome/unrelated evidence |
| E27 | PASS | Repeated hypothesis retrieval remains unverified |
| E28 | PARTIAL | Retained refs and recovery after rotation; T9 final transfer/2 preservation NOT RUN |
| E29 | NOT RUN | A to B autonomous continuation; T9 controller protocol and live continuation NOT RUN; local deterministic replay is only E17 evidence |
| E30 | NOT RUN | New controller acts on stale capsule; T9 controller protocol/live action NOT RUN; engine stale rejection is only E14/E15 evidence |
| E31 | PARTIAL | Offline replay separated from live step; T9 live/model credential-dependent step NOT RUN; no model invoked |
| E32 | PARTIAL | Separate Linux and Windows portability; Separate Windows casing/newline/lock/replace/path tests NOT RUN |

Supplemental regressions: same terminology across two workspaces stays scoped PASS, semantic metadata-only and access-only freshness PASS, more than eight retained revisions PASS, over 4000 receipts and index deletion/rebuild PASS, over 512 feedback records PASS, 64-input and accumulated 65 references PASS, 16 evidence refs per link and 65 distinct links PASS, failed visibility loading PASS, reader concurrent with multi-file apply PASS.

Each PASS links to executed assertion titles and source hashes in the JSON report. There is no claim that an unexecuted T9 requirement passed merely because a neighboring engine boundary is green.

### Reproduce final verification and report

```sh
# Use writable paths of your choice for synthetic outputs.
T8_REPORT=/tmp/T8-measurements.json npm test -- tests/memory-lifecycle-evals.test.ts
T8_REPORT=/tmp/T8-measurements-full.json npm run verify -- -- --reporter=default --reporter=json --outputFile=/tmp/T8-full-suite.json
node tests/helpers/profile-memory-temporal.ts /tmp/T8-temporal-profile.json
node tests/helpers/report-memory-eval.ts /tmp/T8-measurements.json /tmp/T8-full-suite.json /tmp/T8-command-receipts.json /tmp/T8-evidence-report.json
```

Command receipts are documented in the corpus README and included in this report’s JSON. The exact initial failure is preserved in memory-evolution-initial.json; the separate corroborating failure is in memory-evolution-baseline.json. No result uses a model or evaluates autonomous continuation; T9 owns that next boundary.


## G8 acceptance

Independent review and bounded re-review of cd6f214 passed. Exact goal checks, 380 reconciled phase summaries per corrected run, source hashes and both historical dataset identities were independently verified. The reviewer recomputed final ratios and inspected isolated13/full455 evidence, then ran four bounded helper regressions. Partial/NOT RUN cases remain explicit T9 or environment limitations, not passing executions.

## T9 continuation addendum

The T8 numbers and matrix above remain the historical G8 evidence. T9 adds a public transport-neutral controller dispatcher and isolated transfer/2 restore. Its fresh-controller, stale-fallback, >500-record preservation, and Linux portability assertions are reported separately in [T9 verification](memory-controller-transfer.md). Deterministic protocol replay does not change the live-controller or Windows NOT RUN status. No historical T8 JSON, corpus seal, threshold, raw measurement or extraction provenance was rewritten.
