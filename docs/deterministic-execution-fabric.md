# Deterministic Execution Fabric

The Deterministic Execution Fabric is Agent Core's local, durable, dependency-aware command execution layer. It persists run/node/attempt/event state as file-native transactional state, separate from the memory vault, and writes raw process evidence to local files under the Agent Core root.

It is designed to make concurrency, dependencies, retries, wake behavior, restart recovery, and evidence factual. The model supplies semantic decomposition and decisions; Agent Core enforces the declared graph and records what actually happened.

## Rollout state

Execution is enabled by default for normal Agent Core startup, with an explicit diagnostic disable override:

```text
AGENT_CORE_EXECUTION_ENABLED=true    # default
```

## Runtime locations

Default execution state root, overridable with `AGENT_CORE_EXECUTION_STATE_ROOT`:

```text
<Agent-Core-root>\runtime\execution\state
```

Default raw evidence root:

```text
<Agent-Core-root>\runtime\execution\runs\
```

Per-attempt evidence layout:

```text
runtime\execution\runs\<runId>\<nodeId>\attempt-001.stdout.log
runtime\execution\runs\<runId>\<nodeId>\attempt-001.stderr.log
runtime\execution\runs\<runId>\<nodeId>\attempt-001.result.json
```

The terminal result marker is written atomically and records factual run/node/attempt identity, timestamps, state, exit code/signal, byte counts, and SHA-256 hashes of stdout/stderr.

## Persistence model

Execution state is file-native. An append-only event stream is the record of truth, and current state files are materialized from it under atomic rename:

```text
runtime\execution\
  state/
    runs/<run-id>/run.json
    runs/<run-id>/nodes/<node-id>.json
    runs/<run-id>/attempts/<attempt-no>.json
  events/
    <run-id>.jsonl
  leases/
    runtime.lease.json
  checkpoints/
    ...
```

Durable records cover execution runs, nodes, hard dependencies, attempts, monotonic per-run events, parsed-output records, the verified artifact index, and the execution-to-memory sync queue.

Every event carries a sequence number, run/node/attempt identity, event type, timestamp, payload hash, and safe payload. Every write that needs multi-file consistency goes through a transaction journal plus atomic rename:

```text
write temp
flush
atomic rename
read back and validate
```

Concurrency uses an owner-token lease per scope/run rather than one global store lock. Lookups use deterministic file-native indexes/manifests.

Execution state is intentionally separate from the memory vault because execution events and log metadata are high-frequency operational state. Only selected verified execution evidence is promoted into memory.

Parsed outputs give bounded deterministic interpretation of persisted stdout/stderr evidence, and the artifact index supports verified-only lookup and advisory reuse discovery. Startup recovery reconciles a missed artifact index from durable verified terminal result markers, so an interrupted observer cannot silently erase reusable evidence metadata.

## Structured execution intelligence and truth hierarchy

Agent Core applies a strict authority order when multiple execution-intelligence layers are present:

```text
PROCESS TRUTH
>
VERIFIED ARTIFACT TRUTH
>
PARSED STRUCTURED INTERPRETATION
>
ARTIFACT/CACHE SUGGESTION
>
WORKFLOW ADVICE
```

A lower layer may add bounded context but MUST NOT override a higher layer. In particular, parsed summaries cannot convert a failed process into success, a cache match cannot replace current execution truth, and workflow advice cannot promote a suggestion into a fact. A factual process failure remains inspectable evidence even when no artifact was declared.

Structured output parsing is deterministic parser v1. It reads at most the bounded execution-log window, records source stdout/stderr SHA-256 identity, and can derive bounded test summaries, build/deployment state, performance metrics, warning counts, error-pattern counts, and security-issue counts. Parsing is fail-open: parser failure is recorded as degraded derived evidence and never changes factual process success/failure.

Verified artifact indexing accepts only artifacts proven by the durable terminal evidence contract. Supported artifact types are `build`, `test_report`, `log`, `data`, and `other`. Lookups are principal/project scoped and support hash, type, and run identity. `findReusable` is explicitly advisory-only: an existing matching SHA-256 may be suggested for operator/agent consideration, but cache awareness MUST NEVER skip command execution or prove that current inputs and side effects are unchanged. Purge results are suggestions for review only; the artifact manager does not delete files.

The deterministic workflow advisor is read-only. It can surface parallelization, bounded wait, evidence-inspection, parsed-test, and verified-reuse guidance without mutating a run. `proposedNext` is optional and is emitted only when the currently authenticated/routed tool surface actually permits the proposed action. `execution_status` uses lightweight advice without expensive cache validation; explicit `execution_workflow_advice` may perform bounded reusable-artifact validation. Advice is principal/project scoped before the advisor can inspect a run.

## MCP execution surface

Agent Core exposes:

```text
execution_create
execution_start
execution_status
execution_wait
execution_logs
execution_add_nodes
execution_retry
execution_cancel
execution_artifact_find
execution_workflow_advice
```

Mutation tools require a current principal-bound route context. Read operations are authenticated and principal/project scoped, so a fresh same-principal route can inspect an older owned run without requiring the original route to remain alive. `execution_artifact_find` returns compact verified artifact metadata or review-only purge suggestions; it never returns artifact contents or deletes files. `execution_workflow_advice` returns deterministic read-only guidance and never executes its optional `proposedNext` suggestion.

`execution_create` persists a validated DAG but starts no process. `execution_start` dispatches ready nodes up to the run's concurrency bound. Dynamic nodes can be added atomically while a run is planned/running; invalid cycles or missing dependencies are rejected without partial insertion.

## Autonomous memory pre-search

Execution performs a bounded memory pre-search on every explicit launch path: initial DAG creation, run start, dynamic node addition, and retry. The query is derived only from the execution objective plus deterministic node IDs/purposes. Raw command text, environment values, stdout, and stderr are not copied into the memory query.

The pre-search result is returned as `memoryPreSearch` and includes bounded recalled items, prior failures, related decisions, open conflicts, matching hard guardrails, the deterministic snapshot hash, and measured duration. Default execution-specific bounds are 12 recalled items and 6000 characters, further capped by the configured memory recall budgets.

Failure behavior is deliberate:

- disabled memory -> `status: disabled`, execution behavior remains unchanged;
- healthy memory with no matches -> `status: healthy`, `inspectionRequired: false`;
- unavailable/degraded search -> `status: degraded`, execution fails open and records no invented evidence;
- matching active hard guardrail with `AGENT_CORE_MEMORY_ENFORCE_HARD_GUARDRAILS=true` -> execution fails closed with `EXECUTION_MEMORY_GUARDRAIL_BLOCKED` before a process is launched (and, on create, before a run is persisted).

This pre-search complements route-time memory adoption rather than replacing it. Route memory informs capability selection and planning; execution pre-search rechecks the concrete objective/node plan immediately before it can become process work. The dedicated benchmark gate requires real pre-search p95 to remain below 500 ms.

## Dependency and concurrency rules

Default bounds:

```text
maxConcurrency = 4
maxNodes       = 128
waitMaxMs      = 60000
```

The scheduler applies these rules:

- independent ready nodes can run concurrently;
- a node becomes ready only after all hard dependencies succeeded;
- a dependent of a failed/interrupted/cancelled hard dependency becomes blocked;
- unrelated work continues after another node fails;
- max concurrency is never exceeded;
- scheduling order uses deterministic node-ID tie-breaking;
- retries are explicit and create a new attempt while preserving prior evidence.

A process completion never completes the semantic continuity task. It updates execution truth; the agent still finalizes the task with `task_checkpoint` after inspecting evidence.

## Event journal and wake

Every run has a persisted monotonic event sequence. Events include run creation/start/terminal states and node queued/ready/started/output/terminal/retry/cancel states.

Persist-before-signal is the invariant: the event is durably appended before the in-process wake coordinator emits its signal. `execution_wait` first checks for an unseen persisted event, subscribes, performs one bounded race-closing read, and then waits for either a persisted signal or timeout. It does not busy-poll the event stream.

Rapid output notifications are coalesced so arbitrary stdout chunk rates cannot create an event storm.

See `docs/multi-command-wake-workflow.md` for the agent-facing workflow.

## Restart recovery

On execution service startup, any unfinished transaction journal is recovered, the event sequence is validated, materialized state is rebuilt when it disagrees with the events, and a stale runtime lease is reclaimed. Persisted attempts that still say `running` are then reconciled against durable result markers:

- if a valid terminal result marker exists, the marker is factual authority;
- if no terminal result marker exists, the attempt/node becomes `interrupted`;
- missing PID/process state is never treated as success;
- interrupted work can be retried explicitly and prior logs remain intact.

On graceful Agent Core shutdown, new runs stop being accepted, active owned nodes are terminated/recorded as interrupted unless terminal evidence already exists, and every open execution transaction is committed or rolled back before close.

Execution degradation is reported separately. Corrupt or degraded execution state does not make Agent Core OAuth/MCP unavailable and does not erase continuity memory.

## Execution-to-memory bridge

Promotion policy is deliberately narrow:

```text
raw stdout/stderr       -> execution logs only
command progress        -> execution event journal
failure signature       -> redacted memory failure evidence
verified artifact/hash  -> memory/checkpoint evidence
run terminal state      -> process checkpoint
semantic task completed -> task_checkpoint only
```

If memory is degraded, eligible promotions enter the execution memory sync queue. They are replayed idempotently after memory returns healthy. Raw process logs are never promoted wholesale.

## Raw log sensitivity

Raw execution stdout/stderr is authenticated local evidence, not sanitized memory. If a command intentionally prints a secret, that plaintext may exist in its raw log file. Therefore:

- treat `runtime\execution\runs\` as sensitive operator data;
- do not publish, attach, or commit raw logs without reviewing them;
- use bounded `execution_logs` reads instead of dumping entire files into prompts;
- keep secrets in environment/file references rather than inline command text where possible;
- memory search/export must remain free of plaintext secrets from raw logs.

Raw-log retention is an **operator-controlled workflow**. It is intentionally not automatic and is not exposed as a destructive MCP tool.

Only terminal attempt `.stdout.log` and `.stderr.log` files are eligible. Result markers, execution state, artifact-index records, and declared artifacts are never deleted by the retention subsystem. A dry-run plan is immutable and content-addressed; apply revalidates the exact planned files and never expands the deletion set by re-querying the filesystem.

## Execution process governance

Execution and background-process commands now share one process-governance adapter.

```text
process-tree termination   Windows: taskkill /T; POSIX: dedicated process group
wall-clock limit           enforced
combined stdout/stderr cap enforced
CPU-time hard cap          unsupported in the current pure-Node adapter
memory hard cap            unsupported in the current pure-Node adapter
```

`AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES` controls the combined stdout/stderr persistence budget for one execution attempt. The default is 64 MiB and the hard configuration ceiling is 1 GiB. When the budget is exceeded, Agent Core terminates the managed process tree and records a failed result with `EXECUTION_OUTPUT_LIMIT_EXCEEDED`; it does not silently truncate a successful run.

CPU-time and memory hard caps are deliberately reported as unsupported rather than simulated. Adding those caps requires a factual OS-native isolation primitive; the current runtime does not claim one.

## Execution Recovery Bundle

Execution recovery is a stopped-runtime, local operator workflow. The authoritative commands are:

```text
agent-core execution-backup [reason]
agent-core execution-restore <bundle-path>
```

`execution-backup` acquires the execution runtime lease, quiesces open execution transactions, validates the event sequence against the materialized state, copies the complete execution state and evidence trees, computes SHA-256 plus byte size for every file, writes `manifest.json` last, and atomically publishes the completed bundle under the execution `recovery-bundles` directory.

A recovery-bundle manifest records:

```text
bundle format/version
Agent Core source version
execution state format version
creation timestamp and bounded reason
logical state root hash
every state and evidence file path / SHA-256 / size
total evidence bytes
```

Verification fails closed on an unsafe/duplicate manifest path, a missing or additional file, a size/hash mismatch, an event-sequence inconsistency, or an incompatible state format.

Restore is intentionally stopped-runtime only. `ExecutionService` owns `leases/runtime.lease.json` while open; recovery operations must acquire the same exclusive owner-token lease. A live owner therefore blocks restore rather than relying on an advisory instruction.

Before replacing live state, restore:

1. verifies the requested recovery bundle completely;
2. creates a raw pre-restore rollback snapshot of the current state and evidence trees;
3. stages the verified state and evidence beside the live roots;
4. swaps state, then swaps evidence, by atomic rename;
5. revalidates the logical state root hash and the event sequence;
6. restores the pre-restore snapshot automatically if a failure occurs after replacement has begun.

After restore, normal `ExecutionService.open()` recovery remains authoritative: a valid terminal result marker can complete a persisted attempt; missing or identity-mismatched terminal evidence becomes `interrupted`, never success.

## Backup-gated raw-log retention

Retention has two explicit operator phases:

```text
agent-core execution-retention-plan [older-than-days]
agent-core execution-backup retention-before-apply
agent-core execution-retention-apply <plan-path> <bundle-path>
```

The plan phase is dry-run only. It scans terminal result markers and records only matching raw stdout/stderr files whose terminal timestamp is old enough. Each candidate records path, byte size, modification time, and the SHA-256 of its result marker; the whole plan receives a deterministic SHA-256 `planId`.

Apply requires a verified recovery bundle whose creation time is not older than the plan. It acquires the execution runtime lease, then processes exactly the immutable candidate list. A file is deleted only if its size/mtime are unchanged and its result marker still exists with the same SHA-256. Missing/changed candidates or markers are skipped with explicit reason codes. New files discovered after planning are never added to the action set.

Every candidate decision is appended to `execution-retention-audit.jsonl` as either `deleted` or `skipped`. Result markers are preserved, so subsequent recovery/status inspection retains terminal truth even after raw stdout/stderr has been intentionally purged.

These recovery and retention operations are intentionally CLI/operator surfaces. Agent Core does **not** expose an MCP tool that can restore the execution database or physically purge raw evidence.

## Disable execution for diagnostics

Execution can be disabled without deleting its state or logs. Stop Agent Core, then start a diagnostic process with:

```powershell
$env:AGENT_CORE_EXECUTION_ENABLED = 'false'
node dist\index.js
```

Memory, continuity, authentication, and routing stay available. Execution health reports disabled.

To remove the temporary override:

```powershell
Remove-Item Env:AGENT_CORE_EXECUTION_ENABLED -ErrorAction SilentlyContinue
```

Then start Agent Core again through `Agent Code Native.exe`. Normal operation defaults execution on; set `AGENT_CORE_EXECUTION_ENABLED=false` only as an explicit diagnostic or rollback override.

## Runtime observability

`GET /health` remains a lightweight readiness endpoint. Detailed bounded runtime metrics are deliberately separated at:

```text
GET /health/metrics
```

The same detailed snapshot is available through the read-only MCP tool `agent_core_health_metrics`. The metrics registry keeps a bounded rolling sample window while preserving total observation counts and deterministic p50/p95/p99/max summaries. Memory, execution DAG/dispatch/wake, routing, and optional GitHub health are aggregated without exposing credential material. GitHub API health probing is TTL-cached and single-flighted so concurrent health reads do not multiply external probes. Disabling GitHub leaves local readiness independent of optional GitHub connectivity.

## Performance gates

The execution path carries explicit local benchmark gates:

```text
128-node DAG validation p95   < 50 ms
ready dispatch p95            < 100 ms
wake delivery p95             < 250 ms
max observed concurrency      equal to the configured bound
```

Measured timings describe the host they were measured on; they are not a promise that every host/storage configuration produces identical numbers. Correctness is governed by persisted state and tests, never by timing assumptions.

The acceptance suite adds explicit local-only gates for the derived-intelligence layers:

```text
health metrics snapshot p95            < 50 ms
128 KiB structured-output parse p95    < 25 ms
1000-row artifact hash lookup p95      < 50 ms
128-node workflow advisor p95          < 50 ms
100000 metric observations             < 500 ms, rolling window = 128
```

These gates are enabled with `AGENT_CORE_PERFORMANCE_GATES=1`; they are skipped by the normal regression suite so routine tests remain stable across hosts. They must be exercised locally before an execution change is declared accepted. GitHub Actions/CI is not a substitute for these local gates.
