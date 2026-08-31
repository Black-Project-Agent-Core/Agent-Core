# K3 Benchmark Provenance and Evidence Rules

Status: Phase 0 source-derived research

Canonical reference:

- repository: `https://github.com/FareedKhan-dev/kimi-k3-in-c`
- pinned revision: `117e9d29bde14db9742f54fb66a191fd0bf03903`

Purpose: identify what the K3 benchmark artifacts actually prove, how the raw data relates to the current harness, and which evidence standards Super-Runtime should inherit.

## The strongest benchmark idea is enforcement, not a timing number

The current `benchmarks/memory-ladder.sh` refuses to run unless it can impose a genuine Linux cgroup ceiling using `systemd-run --scope --user`.

Each rung uses both:

```text
MemoryMax=<budget>
MemorySwapMax=0
```

This prevents a run from exceeding the intended RAM budget by silently using swap. The harness distinguishes:

```text
SIGKILL / OOM under MemoryMax
    -> did not fit: valid rung outcome

other non-zero exit
    -> runtime/harness failure: not a data point
```

This is a critical methodology for Super-Runtime. A configured memory target is not proven by an allocation estimate; it must be externally enforceable in acceptance testing.

## Correctness is checked at every memory rung

The memory ladder records generated token IDs and compares them against the first successful rung. Empty or unreadable output does not count as agreement.

The experiment therefore tests two independent claims:

```text
resource claim: does the run fit the hard cap?
semantic claim: does the output stay identical?
```

A memory optimization that fits but changes output fails.

## Current harness requires replication by default

The canonical current harness defaults to three repetitions per rung/split. Its source explains the reason: an identical configuration was observed with a 33.1% run-to-run spread.

The current harness reports mean, standard deviation, and within-configuration spread, and explicitly warns that a difference smaller than the observed spread is not an established performance effect.

## The published raw tables predate replicated reruns

The raw table `docs/data/memory-ladder.tsv` was added in commit:

```text
42efb678360b2bba564d8895077cd8fe0299d1a5
```

The benchmark harness was added in:

```text
64155c831a79ab393c8c9a57b2d08fca6bf2e8c2
```

The raw memory table contains twelve budget rows from 8 GB through 224 GB, with one timing sample per row. The current harness uses a smaller current rung set and defaults to multiple repetitions.

This is not hidden by the repository. `docs/PERFORMANCE.md` explicitly says the old tables are single-sample measurements and must be interpreted against the measured noise floor.

### Consequence

Do not quote old K3 single-run timing differences as precise performance laws.

The evidence should be separated into:

```text
strong:
- exact generated IDs
- bytes read
- hit/miss/eviction counts
- actual peak RSS
- fit / OOM under hard cap

conditional:
- direction supported across many points and mechanism

weak unless replicated:
- small wall-clock differences
- exact speedup factor from one endpoint pair
```

## Raw memory-ladder evidence

`docs/data/memory-ladder.tsv` records the same generated IDs across its published memory budgets:

```text
17374,20829,10,427,414,1008,606,142957
```

Selected rows include:

| total GB | s/token | peak RSS GB | expert hit | trunk hit | GB read |
|---:|---:|---:|---:|---:|---:|
| 8 | 32.69 | 8.24 | 0.0% | 0.0% | 25.83 |
| 32 | 31.44 | 31.90 | 0.0% | 10.3% | 25.83 |
| 96 | 24.40 | 95.51 | 29.89% | 40.5% | 18.11 |
| 128 | 29.40 | 128.18 | 32.20% | 56.5% | 17.51 |
| 224 | 19.21 | 223.82 | 43.75% | 84.7% | 14.53 |

The exact timings are single samples. The byte/count/output columns are stronger evidence than their timing column.

## The measured noise floor is large

`docs/data/replication.tsv` records three back-to-back runs of the same configuration:

```text
14.7760 s/token
14.6655 s/token
20.1408 s/token
```

Repository summary:

```text
mean   16.53 s/token
sd      3.13
spread 33.1%
```

`docs/BENCHMARKING.md` states that replication was performed after some earlier conclusions had already been drawn and caused those conclusions to be retracted. This is an important research-method lesson: benchmark procedure itself evolved from failures of interpretation.

## Fixed-budget split sweep: direction stronger than factor

`docs/data/trunk-cache-split.tsv` varies the allocation between trunk and expert cache while holding total memory fixed.

At 128 GB, endpoints are:

```text
trunk 12.3 GB / cache 110.7 GB -> 28.38 s/token
trunk 110.0 GB / cache 13.0 GB -> 16.80 s/token
```

The endpoint ratio is about 1.69x, but the repository explicitly says this factor is not replicated to the project's current three-run standard.

What the repository treats as more credible is the direction across multiple points and two independent budgets:

```text
Spearman rho at 128 GB: -0.886
Spearman rho at  32 GB: -0.714
```

The mechanism independently supports the same direction: every token traverses the full streamed trunk, while expert access is sparse/data-dependent.

### Super-Runtime extraction

Policy tuning should report separately:

```text
mechanism hypothesis
count/byte evidence
replicated wall-clock evidence
```

Do not collapse all three into one claim.

## Cache trace replay is an unusually reusable methodology

K3 records the model's `(layer, expert)` requests before cache outcome is known. Therefore a request trace represents model demand, not cache behavior.

`tools/sim_cache.py` can replay that same trace under:

- LRU;
- Belady optimal offline replacement;
- pinned-hotset + LRU.

This means cache-policy experiments do not require rerunning the 1.56 TB model for every capacity.

It also calculates compulsory misses, placing a hard upper bound on any replacement policy for a fixed trace.

### Super-Runtime extraction

The residency layer should emit a policy-neutral trace such as:

```text
timestamp / sequence
model region identity
semantic class
physical range
request cause/op
priority/deadline
```

Policy outcomes should be logged separately:

```text
hit
miss
prefetch-hit
eviction
wait time
bytes loaded
```

That separation permits deterministic offline policy replay.

## Measure the quantity an optimization claims to change

`docs/BENCHMARKING.md` explicitly prefers stable counters over timing when possible.

If an optimization claims to reduce I/O, compare:

```text
bytes read
number of requests
unique ranges
cache retention
```

before comparing seconds.

If it claims to reduce memory, compare:

```text
runtime accounting
measured RSS/working set
external hard-limit result
```

If it claims semantic equivalence, compare exact outputs or a stronger numeric oracle.

This rule should become a Super-Runtime acceptance principle:

> Every optimization must have a primary metric that directly represents the mechanism it changes.

## Benchmark provenance should be a first-class artifact

The K3 ladder writes machine provenance alongside each run, including CPU, core count, memory, filesystem/storage location, engine version, repetition count, input IDs, and generation length.

Super-Runtime should go further and attach to every benchmark artifact:

```text
Super-Runtime commit
substrate commit
model/container fingerprint
architecture adapter
quantization
OS/kernel
CPU ISA
GPU/device drivers if present
storage device/filesystem
runtime memory policy
hard-limit mechanism
context size
parallelism
cold/warm policy
raw per-run records
```

A summarized chart without this provenance should not be accepted as architectural evidence.

## Proposed Super-Runtime evidence hierarchy

### Level 0 - structural proof

Source inspection, shape/type contracts, deterministic calculations.

### Level 1 - synthetic correctness

Tiny structurally faithful fixtures, short-read/corruption/race injection, exact oracle comparison.

### Level 2 - mechanism counters

Bytes, requests, cache states, allocations, state size, exact generated outputs.

### Level 3 - enforced resource proof

Hard external RAM limit, swap disabled where applicable, measured working set/RSS.

### Level 4 - replicated performance

At least three comparable runs per arm plus environment provenance; more when variance demands it.

### Level 5 - real agent workload

Repository-scale coding tasks with tool calls, context growth, session persistence, and end-to-end task correctness under the configured resource envelope.

## Conclusion

The most valuable inheritance from K3 benchmarking is not its published seconds/token. It is the discipline that evolved around the measurements:

```text
hard ceiling
+ exact semantic gate
+ policy-neutral traces
+ raw counters
+ machine provenance
+ replication before timing claims
```

Super-Runtime should build this evidence model into the runtime and CI from its first prototype.
