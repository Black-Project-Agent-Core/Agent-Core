# Engineering: Mechanisms Before Labels

Read only for software, agent systems, state, retrieval or performance questions. These are conditional techniques, not a mandatory technology stack.

## Current system before new architecture

Inspect the actual entrypoint, callers, implementation, configuration, tests, persisted state and relevant runtime evidence. Follow local ownership and contracts. Reuse a compatible component before introducing another planner, memory store, router or scheduler. Report coverage honestly; a focused trace is not a whole-codebase audit.

For agent workflows, map request -> authorization -> discovery/schema -> dispatch -> execution -> result -> persistence/resume. Identify which owner controls each transition. Check the exact tool grants, current task binding, result schema and error propagation. A shared tool registry does not prove identical permissions, configuration or runtime capability.

## Dependency and state models

Use a table or ordinary graph first: nodes represent real components/states and edges represent actual data, control or authority dependencies. Use a hypergraph only when a relation genuinely involves several parties and simpler notation loses necessary information. Label inferred edges. A diagram alone neither detects all deadlocks nor proves a system is correct; inspect ordering, lock ownership, wait conditions and traces.

For persistent/resumable work inspect stable identity, atomicity, idempotency, fencing, duplicate execution, crash windows and reconciliation across stores. Distinguish runtime IDs from persistent identity and grouping operations from rollback. Define invariants and failure paths before proposing structural changes.

## Performance and zero-copy

Measure before optimizing. State hardware, workload, concurrency, payload size, baseline, percentile metric, measurement overhead and variance. A target is not a guarantee. No generic requirement for 20 ms latency, sub-microsecond dispatch, sub-millisecond retrieval or 5 ms recovery follows from this skill.

If profiling identifies serialization/copying as a significant bottleneck, compare batching, simpler serialization and shared-memory approaches. For shared buffers inspect ownership, lifetime, synchronization, memory ordering, bounds, process isolation and crash cleanup. Local zero-copy cannot remove remote network latency. Reject an optimization whose complexity exceeds its measured benefit.

## Fault containment and recovery

Consider timeouts, bounded retries with backoff, circuit breakers, bulkheads and supervised worker restart only for evidenced failure modes. Define detection signals, thresholds, recovery probes and bounded retry budgets. Ensure retries are safe for side effects, prevent retry storms, expose persistent failures and preserve diagnostic traces. “Self-healing” requires an observed recovery mechanism and acceptance evidence, not a label.

## Integrity and cryptography

Differentiate accidental corruption, authenticity, authorization, replay and confidentiality. A plain checksum may detect accidental changes but does not establish authenticity against an attacker who can replace both data and checksum. Use established authenticated mechanisms when the threat model requires them; do not invent cryptography or claim “quantum-resilient” security from deterministic hashing alone. Security changes require their own review and authorization.

## Memory and retrieval

Confirm the current repository, namespace, source freshness and access scope before recalling historical decisions. Compare lexical search, exact lookup and vector/ANN retrieval against actual retrieval needs. Evaluate recall quality, false matches, stale records, latency and end-to-end token/cost effects. Faster retrieval is not necessarily better evidence, and retrieving more context is not necessarily cheaper. Do not invent indices, dependencies, local paths or a universal vector-memory requirement. Memory writes are separate authorized actions, not an automatic effect of reasoning.

## Adversarial verification

Select failure cases from the mechanism: malformed inputs, boundary values, cancellation, concurrency, partial writes, duplicate requests, timeouts, resource exhaustion and dependency failure. Use an isolated environment, bounded load and rollback where needed. Never deliberately break production to prove rigor.

For provider routing and quota handling, exercise actual decision logic using mocked provider responses where feasible. Assert selected route, attempted keys, error classification and persisted continuation. Separate quota limits from authentication, unsupported-model and other errors. Do not exhaust real keys or incur model usage without explicit permission. Live checks, when authorized, address integration questions that fixtures cannot answer.

## Acceptance chain

Keep these statuses separate: source inspected -> source changed -> relevant checks executed -> artifact built -> approved activation -> running-version verified -> requested behavior observed. Not every task requires the entire chain. A read-only audit stops at evidence; implementation or activation is not silently added. Preserve unrelated changes and report untested surfaces.

## Context degradation and anti-goals

Inspect loss of task constraints through truncation, stale summaries, conflicting records and irrelevant retrieval. Compare retained decision-critical information against memory overhead, retrieval cost, prompt-token cost and task outcome. State anti-goals explicitly: no duplicate effects, unauthorized model spend, context loss or production outage where applicable.

For proposed changes, connect consequences to mechanisms: retries can amplify traffic; caching can introduce staleness; larger recall can increase token cost; automatic recovery can repeat a non-idempotent action. Estimate blast radius and reversibility rather than treating every imaginable disaster as equally plausible.

## Codebase and strategic reviews

For a codebase-wide claim, maintain a coverage map of inspected modules, owners, contracts and unexamined surfaces. A few selected paths do not establish whole-repository coverage. For a strategic roadmap, separate demonstrated baseline, dependency assumptions, candidate milestones and acceptance evidence; do not portray future plans as installed capabilities.
