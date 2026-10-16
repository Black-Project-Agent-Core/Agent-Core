# Sealed synthetic lifecycle corpus v1

`corpus.json` contains independently authored expected answers, exact mandatory
state, obligations, next action, Unicode/BOM/CRLF source bytes and SHA-256,
adversarial input and measurement parameters. It was authored before the engine
was run. `cases.json` maps **every E01–E32 boundary** to actual executed tests or
explicit unrun scope. Existing T0–T7 tests are reused, not replaced with superficial
E-number assertions. The report records the source hashes of reused test files.

Both JSON byte hashes are pinned in `tests/helpers/memory-eval.ts`. Changes require
an explicit reviewed new oracle/seal, never automatic regeneration from proposed
engine output. Runtime UUIDs cannot be predetermined; the test binds the captured
artifact identity only after independently checking the exact original evidence
bytes against the sealed digest. Every returned evidence-backed mandatory item must contain that
exact bound ref and all sealed fields. These integrity checks are not semantic
proof for arbitrary natural language outside this corpus.

The two lifecycle roots contain 10 and 300 events including start, state and real
reviewed promotion. The remaining events are genuine public append operations,
not directly written archive files. The old recovery is promoted as an unverified
observation and archived. A fresh service/controller compares full paged episode
history with capsule plus **the same selected original evidence**. Discovery then
reconstructs archived record -> source event -> evidence. Assertions cover exact
state and obligations, safe cross-workspace rejection, explicit budget overflow,
unknown lexical queries and unavailable adversarial capture. A deterministic
replay is not the T9 autonomous/live-controller continuation.

Separate 10/100/1,000-record roots use the public batch API in chunks up to 100.
Every legacy/facade pair uses the same root, query, top-1 relevance label and record.
Facade discovery and complete selected-record expansion are reported separately.
Two warmups, 11 history trials, 31 lexical trials, alternating measured mode order;
monotonic `performance.now()`, nearest-rank p95. All serialized response bytes and
calls count, including envelopes, expansions, setup and warmups (separate phases).
Read timing includes engine I/O and telemetry, not a network or model roundtrip.
The fixed median <=1.20x and p95 <=1.30x lexical guard can FAIL while functional
tests pass. It is not retuned to observed results. Cold initialization/restart,
initial writes, checkpoint and storage growth are separate. No tokenizer, model,
API key, Windows operation or user data is used.

## Reproduce

```sh
npm run build
T8_CORRUPT_ORACLE=fact npm test -- tests/memory-lifecycle-evals.test.ts -t 'sealed independent oracle'
T8_CORRUPT_ORACLE=ref npm test -- tests/memory-lifecycle-evals.test.ts -t 'sealed independent oracle'
# Both negative commands MUST exit 1 for the intended mandatory item/ref assertion.
T8_REPORT=/tmp/T8-measurements.json npm test -- tests/memory-lifecycle-evals.test.ts
npm test -- --reporter=default --reporter=json --outputFile=/tmp/T8-full-suite.json
```

The normal suite must pass the negative-controls test by observing rejection.
The explicit red commands deliberately make the corrupted answer the candidate
being judged; an assertion failure proves the oracle is not tautological.

`resolveCases` requires an executed passing assertion for every proof selector.
Missing tests are NOT RUN, skipped tests are SKIPPED, case-level incomplete proof
is PARTIAL, failed tests are FAIL. T9 transfer, controller action, live model and
Windows requirements remain separately unrun; no E-label or existing source file
is itself evidence of a pass. `UNKNOWN` applies to unestablished freshness or
truth, `UNAVAILABLE` to outcomes/sources that cannot be established, and `NOT RUN`
to a test or execution not attempted. No skip is used to hide functional failure.

Additional diagnostics (kept out of measured guardrail samples):

```sh
node tests/helpers/profile-memory-temporal.ts /tmp/T8-temporal-profile.json
node tests/helpers/report-memory-eval.ts /tmp/T8-measurements.json /tmp/T8-full-suite.json /tmp/T8-command-receipts.json /tmp/T8-evidence-report.json
```

The report command requires a JSON object of real command receipts keyed by
`dependency-and-build`, `baseline-and-full-suite`, and `package-boundary`. Each
receipt supplies `status`, executed `command`, raw `exitCode`, and evidence digest.
Absent receipts remain NOT RUN. No report command can fabricate a passing test
from a title or E-number: the Vitest assertion must actually have passed.

## G8 review corrections

The full goal object is checked against the declared start input: critical=true,
active, empty sourceRefs, and exact unverified/empty-evidence verification. Its
only dynamic field is a v4 UUID bound once from the validated initial episode,
before checkpoint generation. Later history/capsule goals must retain that ID.
Initial binding costs are included in setup responses, not hidden in read trials.

Meter summaries copy response arrays and rows so discovery cannot acquire later
expansion entries. Every summary checks calls/bytes against its response rows,
and report generation recursively rejects inconsistent phase accounting.

Historical initial and corroborating JSON are preserved unchanged, including
the original mutable-response-array defect; their discovery numeric aggregates
remain the recorded values, while response row lists are explicitly historical
and not authoritative phase evidence. Corrected current reports come only from
fresh runs. The initial JSON has its original older case-matrix seal; the corpus
workload and thresholds themselves are unchanged.
