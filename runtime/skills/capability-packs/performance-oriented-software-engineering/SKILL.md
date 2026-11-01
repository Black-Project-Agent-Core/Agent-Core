---
name: performance-oriented-software-engineering
description: Design or optimize software when workload scale, latency, throughput, CPU/I/O, or memory use affects implementation choices. Use for performance investigations and relevant new features, data processing, responsive applications, and concurrent systems; skip trivial edits and non-software work.
metadata:
  authored-by: "explicit-user-request"
  origin-proposal-id: "skill-proposal:c354a95b6f295cda0dcc0011e1cb9153"
  origin-proposal-revision: "sha256:00b8a7430844509b7c7ffc67e4883f986acf28d8828cf9ba32505b4372407377"
---

# Performance-Oriented Software Engineering

**Analyze the workload before selecting an implementation strategy.**

## Triggers

- Software design or optimization where workload scale, latency, throughput, CPU, I/O, memory use, responsiveness, data processing, or concurrency can materially affect the implementation.

## Non-triggers

- Trivial edits, non-software work, or changes whose implementation choice cannot materially affect performance.

## Operating principle

Understand intended behavior first. Select techniques from the workload, dependencies, hardware, and measured costs. Prefer the simplest design meeting performance, correctness, reliability, and maintainability needs. The techniques below are options, not a checklist.

## Characterize the work

Identify the constraints that can change the design:

- Input size, shape, frequency, growth, repeated work, and the actual hot path.
- The relevant objective: response latency, throughput, startup time, peak memory, allocation/GC pressure, or resource cost. Use the user's target when given.
- CPU work versus I/O wait, memory pressure/bandwidth, lock contention, and external service limits. Distinguish an observed bottleneck from a hypothesis.
- Independent tasks versus ordering, shared state, consistency, invalidation, and sequential dependencies.
- Available CPU cores, runtime/compiler, storage/network, and accelerators when relevant. Reuse existing capabilities; hardware inspection is unnecessary when it cannot affect the choice.

Start from existing profiles, telemetry, representative inputs, and code paths. For new features, state the expected workload and assumptions. Ask only about constraints that could change the design; ordinary implementation does not require a benchmark project.

Before choosing a technique, state a compact performance contract:

- **Workload:** representative input distribution, request mix/rate, concurrency, and expected growth; label measured facts versus estimates.
- **Objective:** the user or product target, such as a latency quantile when tail behavior matters, throughput, startup, peak memory, or resource cost. Do not invent numerical SLOs.
- **Boundary and guardrails:** where measurement starts/ends and which correctness, reliability, and resource limits cannot regress.

Trace the user-relevant critical path and its dominant cost. A system-wide average can hide a serial stage, queueing, saturation, or tail latency; use existing profiles, traces, and stage measurements when they can distinguish those cases.

## Select techniques by fit

### Code and data optimization

| Technique | Consider when | Check the tradeoff |
| --- | --- | --- |
| Algorithmic optimization | Repeated scans, unnecessary work, or poor complexity dominate at the expected input size. | Compare actual sizes and constants; preserve semantics and edge cases. |
| Data-Oriented Design | Large homogeneous collections or hot loops benefit from locality, compact layout, and sequential access. | Avoid a broad representation rewrite unless locality or bandwidth is a relevant constraint. |
| Incremental computation | A small change currently recomputes a much larger derived result. | Track dependencies and invalidation so additions, removals, and updates remain correct. |
| Memoization/caching | Expensive results are reused for equivalent inputs. | Define keys, ownership, validity, eviction, memory bounds, and concurrent misses; include relevant user/security scope. |
| Allocation-aware programming | Temporary objects, copies, serialization, or GC create material overhead. | Reduce copies/lifetimes or reuse buffers with clear ownership; add pooling only when its complexity is justified. |

### Execution and scheduling

| Technique | Consider when | Check the tradeoff |
| --- | --- | --- |
| Async/non-blocking I/O | Independent waits or blocking I/O limit responsiveness or utilization. | Async does not make CPU-bound work parallel; preserve cancellation, timeout, and cleanup behavior. |
| Bounded concurrency | Multiple operations can overlap within resource and service limits. | Bound active work and queued data; apply backpressure rather than launching an unbounded fan-out. |
| Task-based parallelism with worker pools | Independent CPU work or blocking operations justify moving work to workers. | Include startup, scheduling, serialization/transfer, shared-state contention, and available cores in the cost. |
| Batching | Per-call overhead dominates and work can be grouped. | Bound batch size and waiting time; preserve failure, ordering, retry, and transaction semantics. |
| Streaming/pipelining | Large inputs or independent stages can be processed progressively. | Bound retained state and in-flight chunks; preserve backpressure and required ordering across stages. |

### Hardware acceleration

For SIMD/GPU guidance when the measured critical path is data-parallel, read [hardware acceleration](references/hardware-acceleration.md).

### Measured optimization patterns

After a measured bottleneck exists, read [performance optimization](references/performance-optimization.md) (frontend, backend and query patterns; merged from the retired `performance-optimization`, see [merged-from](references/merged-from.md)).

Prefer removing unnecessary work before adding execution machinery. Combine techniques only where their benefits survive coordination and memory costs. Preserve the user's chosen stack and scope; this skill does not authorize unrelated infrastructure or toolchain changes.

## Tooling boundary

Reuse available tools and the user's chosen stack. A performance task does not itself authorize new dependencies or system-wide configuration. When an unavailable runtime is necessary and installation is authorized, follow [the tooling and host-integration reference](references/tooling-and-host-integration.md) for isolation, file ownership, and the optional prompt hook.

## Verify proportionately

Match evidence to the claim: a microbenchmark can explain a local mechanism, profiling can locate a bottleneck, and representative load or end-to-end measurements are needed for user-visible system impact. A microbenchmark alone does not establish an end-to-end gain.

Before changing a performance path, establish a representative baseline when practical: realistic input size/distribution and concurrency. Compare under the same environment/workload; account for warm-up, caches, variance, and end-to-end overhead. State limits when samples cannot characterize variance or tails.

Check relevant correctness and reliability properties as well as the target metric: outputs, ordering, cancellation, invalidation, error paths, resource cleanup, and numerical tolerance as applicable. Measure the metrics needed for this decision, not every possible metric.

Keep optimizations that evidence supports or a concrete requirement demands. Simplify or revert when overhead outweighs gain; stop after targets and material risks are addressed. If profiling is impractical, state assumptions and verification limits. Never invent a speedup.

Explain the workload/bottleneck, the chosen approach and tradeoffs, and the actual before/after evidence concisely. Distinguish observed results from expected benefits.

