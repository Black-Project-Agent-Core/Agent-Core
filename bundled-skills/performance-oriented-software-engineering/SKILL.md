---
name: performance-oriented-software-engineering
description: Design or optimize software when workload scale, latency, throughput, CPU/I/O, or memory use affects implementation choices. Use for performance investigations and relevant new features, data processing, responsive applications, and concurrent systems; skip trivial edits and non-software work.
---

# Performance-Oriented Software Engineering

**Analyze the workload before selecting an implementation strategy.**

Understand the user's brief and intended behavior first. Choose and combine techniques according to the workload, dependencies, available hardware, and measured performance. Prefer the simplest architecture that achieves the required performance, correctness, reliability, and maintainability. Treat the techniques below as options, not a checklist to implement.

## Characterize the work

Identify the constraints that can change the design:

- Input size, shape, frequency, growth, repeated work, and the actual hot path.
- The relevant objective: response latency, throughput, startup time, peak memory, allocation/GC pressure, or resource cost. Use the user's target when given.
- CPU work versus I/O wait, memory pressure/bandwidth, lock contention, and external service limits. Distinguish an observed bottleneck from a hypothesis.
- Independent tasks versus ordering, shared state, consistency, invalidation, and sequential dependencies.
- Available CPU cores, runtime/compiler, storage/network, and accelerators when relevant. Reuse existing capabilities; hardware inspection is unnecessary when it cannot affect the choice.

Use existing profiles, telemetry, representative inputs, and code paths before introducing new tooling. For a new feature, reason from its expected workload and identify assumptions worth checking. Ask about a missing constraint only when it would materially change the solution; do not turn ordinary implementation into a mandatory benchmarking project.

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

- **Vectorization/SIMD:** consider suitable hot data-parallel loops and existing optimized libraries/compiler support. Verify target capabilities and numerical behavior before adding architecture-specific code.
- **GPU computing:** consider supported, sufficiently large parallel workloads with adequate device memory. Include initialization, transfers, synchronization, and fallback costs in the end-to-end comparison; accelerator availability alone is not a reason to use it.

Prefer removing unnecessary work before adding execution machinery. Combine techniques only where their benefits survive coordination and memory costs. Preserve the user's chosen stack and scope; this skill does not authorize unrelated infrastructure or toolchain changes.

## Isolated Tooling & File Ownership

When the selected programming language requires an unavailable runtime, compiler, SDK, or dependency, help the user install the missing requirements within applicable permissions. Prefer self-contained, isolated installations over global installations or system-wide configuration changes.

### Tooling Location & Isolation

Store reusable skill-owned runtimes, compilers, SDKs, and dependencies in a dedicated `tooling` subdirectory within their owning skill folder whenever technically feasible. Keep these environments isolated, reusable, and separate from project artifacts. Project-specific dependencies and environments belong in the designated project workspace. If no relevant skill exists, use a project-local isolated environment instead; do not create or misuse a skill folder solely to store project requirements.

### Script & Artifact Ownership

Determine file placement by ownership and purpose, not by when or during which task a file was created.

- **Skill-owned:** Reusable scripts for downloading, installing, configuring, or preparing a skill's requirements belong in that skill's folder, including scripts created while completing a project task.
- **Project-owned:** Project source code, task-specific scripts, project-only setup scripts, downloaded project assets, build artifacts, and outputs belong exclusively in the designated project workspace.

Never place skill-owned scripts in project folders, or project-owned files and folders inside skill folders. A project workspace must never be nested within a skill folder.

### Installation Permissions & Fallbacks

Avoid global installations and system-wide changes whenever a compatible local alternative exists. If isolation is technically unsupported or incompatible with the requirements, explain the limitation and obtain explicit approval before performing any system-wide installation or configuration change. When installation permissions are unavailable, provide installation instructions instead of proceeding without authorization.

### Consistency & Reusability

Maintain clear ownership boundaries, avoid redundant installations and duplicate setup scripts, and reuse existing compatible tooling whenever possible. Do not relocate existing project files into skill folders or mix project artifacts with reusable skill infrastructure.

## Verify proportionately

Establish a baseline before changing an existing performance path when practical. Profile or benchmark a representative workload, including realistic size/distribution and concurrency. Keep the comparison environment and workload comparable; account for warm-up, caches, variance, and end-to-end overhead where they matter.

Check relevant correctness and reliability properties as well as the target metric: outputs, ordering, cancellation, invalidation, error paths, resource cleanup, and numerical tolerance as applicable. Measure the metrics needed for this decision, not every possible metric.

Retain an optimization only when evidence supports its benefit or it satisfies a concrete requirement. Simplify or revert changes whose overhead outweighs the gain. Stop once the required target is met and meaningful risks are resolved. If profiling is impractical, state the assumptions and verification limits; do not invent a speedup or call an unmeasured change faster.

Explain the workload/bottleneck, the chosen approach and tradeoffs, and the actual before/after evidence concisely. Distinguish observed results from expected benefits.

## Optional host hook

`scripts/performance_prompt_hook.py` supplies a short relevance reminder for a host's `UserPromptSubmit` event. The AI still decides whether the current brief warrants this skill. The hook does not select techniques, run a model, inspect a repository, store prompts, or change task permissions. Native implicit skill selection and explicit invocation remain usable without the hook. Hook registration and trust are host configuration, separate from these portable instructions.

For installation on another computer, see [INSTALL.md](INSTALL.md). `scripts/install_skill.py` reuses existing Python and registers the hook with destination paths while preserving other hooks; trust is reviewed on the destination host.
