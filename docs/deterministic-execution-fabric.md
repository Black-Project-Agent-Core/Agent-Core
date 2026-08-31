# Deterministic Execution Fabric

The Deterministic Execution Fabric is Agent Core's local, durable, dependency-aware command execution layer. It persists run/node/attempt/event state in a separate SQLite database from DMF and writes raw process evidence to local files under the Agent Core root.

It is designed to make concurrency, dependencies, retries, wake behavior, restart recovery, and evidence factual. The model supplies semantic decomposition and decisions; Agent Core enforces the declared graph and records what actually happened.

## Rollout state

The execution fabric passed the Tasks 19-21 production gates and the Task 22 Stage A/B live canaries. Stage C makes execution enabled by default for normal Agent Core startup while preserving an explicit diagnostic disable override.

```text
AGENT_CORE_EXECUTION_ENABLED=true    # production default after Task 22 Stage B live canary
```

The v5 capability stage means the execution surface and behavior contract are production-ready; it does not bypass the staged live enablement/canary procedure.

## Runtime locations

Default execution database:

```text
<Agent-Core-root>\runtime\execution\agent-core-execution.sqlite
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

The execution SQLite database contains durable records for:

- execution runs;
- nodes;
- hard dependencies;
- attempts;
- monotonic per-run events;
- execution-to-DMF sync queue entries;
- schema migration state.

The execution database is intentionally separate from the DMF database because execution events/log metadata are high-frequency operational state. Only selected verified execution evidence is promoted into DMF.

Execution schema evolution is additive and evidence-focused:

- schema v3 adds `execution_parsed_outputs` for bounded deterministic interpretation of persisted stdout/stderr evidence;
- schema v4 adds `execution_artifacts` for verified-only artifact indexing, lookup, and advisory reuse discovery;
- startup recovery also reconciles a missed artifact index from durable verified terminal result markers, so an interrupted observer cannot silently erase reusable evidence metadata.

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

Execution now performs a bounded DMF pre-search on every explicit launch path: initial DAG creation, run start, dynamic node addition, and retry. The query is derived only from the execution objective plus deterministic node IDs/purposes. Raw command text, environment values, stdout, and stderr are not copied into the memory query.

The pre-search result is returned as `memoryPreSearch` and includes bounded recalled items, prior failures, related decisions, open conflicts, matching hard guardrails, the deterministic snapshot hash, and measured duration. Default execution-specific bounds are 12 recalled items and 6000 characters, further capped by the configured DMF recall budgets.

Failure behavior is deliberate:

- disabled DMF -> `status: disabled`, execution behavior remains unchanged;
- healthy DMF with no matches -> `status: healthy`, `inspectionRequired: false`;
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

Persist-before-signal is the invariant: the event is committed to SQLite before the in-process wake coordinator emits its signal. `execution_wait` first checks for an unseen persisted event, subscribes, performs one bounded race-closing read, and then waits for either a persisted signal or timeout. It does not busy-poll the database.

Rapid output notifications are coalesced so arbitrary stdout chunk rates cannot create an event storm.

See `docs/multi-command-wake-workflow.md` for the agent-facing workflow.

## Restart recovery

On execution service startup, persisted attempts that still say `running` are reconciled against durable result markers:

- if a valid terminal result marker exists, the marker is factual authority;
- if no terminal result marker exists, the attempt/node becomes `interrupted`;
- missing PID/process state is never treated as success;
- interrupted work can be retried explicitly and prior logs remain intact.

On graceful Agent Core shutdown, new runs stop being accepted, active owned nodes are terminated/recorded as interrupted unless terminal evidence already exists, and the execution SQLite worker is checkpointed before close.

Execution degradation is reported separately. A corrupt/degraded execution DB does not make Agent Core OAuth/MCP unavailable and does not erase DMF continuity memory.

## Execution-to-DMF bridge

Promotion policy is deliberately narrow:

```text
raw stdout/stderr       -> execution logs only
command progress        -> execution event journal
failure signature       -> redacted DMF failure evidence
verified artifact/hash  -> DMF/checkpoint evidence
run terminal state      -> process checkpoint
semantic task completed -> task_checkpoint only
```

If DMF is degraded, eligible promotions enter `execution_memory_sync_queue`. They are replayed idempotently after memory returns healthy. Raw process logs are never promoted wholesale.

## Raw log sensitivity

Raw execution stdout/stderr is authenticated local evidence, not sanitized memory. If a command intentionally prints a secret, that plaintext may exist in its raw log file. Therefore:

- treat `runtime\execution\runs\` as sensitive operator data;
- do not publish, attach, or commit raw logs without reviewing them;
- use bounded `execution_logs` reads instead of dumping entire files into prompts;
- keep secrets in environment/file references rather than inline command text where possible;
- DMF search/export must remain free of plaintext secrets from raw logs.

Wave C adds an **operator-controlled raw-log retention workflow**. It is intentionally not automatic and is not exposed as a destructive MCP tool.

Only terminal attempt `.stdout.log` and `.stderr.log` files are eligible. Result markers, the execution database, artifact-index records, and declared artifacts are never deleted by the retention subsystem. A dry-run plan is immutable and content-addressed; apply revalidates the exact planned files and never expands the deletion set by re-querying the filesystem.

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

`execution-backup` acquires the execution runtime lease, opens the execution database through the existing execution worker, verifies SQLite integrity, checkpoints WAL, creates a SQLite backup through the worker, copies the complete execution evidence tree, computes SHA-256 plus byte size for the database and every evidence file, writes `manifest.json` last, and atomically publishes the completed bundle under the execution `recovery-bundles` directory.

A recovery-bundle manifest records:

```text
bundle format/version
Agent Core source version
execution schema version
creation timestamp and bounded reason
database SHA-256 / size / integrity
every evidence file path / SHA-256 / size
total evidence bytes
```

Verification fails closed on an unsafe/duplicate manifest path, missing or additional evidence file, size/hash mismatch, SQLite integrity failure, or schema incompatibility.

Restore is intentionally stopped-runtime only. `ExecutionService` owns `<execution-db>.runtime.json` while open; recovery operations must acquire the same exclusive lease. A live owner therefore blocks restore rather than relying on an advisory instruction.

Before replacing live state, restore:

1. verifies the requested recovery bundle completely;
2. creates a raw pre-restore rollback snapshot of the current DB/WAL/SHM and evidence tree;
3. stages the verified database and evidence;
4. swaps the database, removes stale WAL/SHM, then swaps evidence;
5. rechecks SQLite integrity;
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

Execution can be disabled without deleting its database or logs. Stop Agent Core, then start a diagnostic process with:

```powershell
$env:AGENT_CORE_EXECUTION_ENABLED = 'false'
node dist\index.js
```

DMF, continuity, authentication, routing, and legacy operational tools can remain available. Execution health reports disabled.

To remove the temporary override:

```powershell
Remove-Item Env:AGENT_CORE_EXECUTION_ENABLED -ErrorAction SilentlyContinue
```

Then start through the normal launcher/configuration. Normal operation now defaults execution on; set `AGENT_CORE_EXECUTION_ENABLED=false` only as an explicit diagnostic or rollback override.

## Runtime observability

`GET /health` remains a lightweight readiness endpoint. Detailed bounded runtime metrics are deliberately separated at:

```text
GET /health/metrics
```

The same detailed snapshot is available through the read-only MCP tool `agent_core_health_metrics`. The metrics registry keeps a bounded rolling sample window while preserving total observation counts and deterministic p50/p95/p99/max summaries. Memory, execution DAG/dispatch/wake, routing, and optional GitHub health are aggregated without exposing credential material. GitHub API health probing is TTL-cached and single-flighted so concurrent health reads do not multiply external probes. Disabling GitHub leaves local readiness independent of optional GitHub connectivity.

## Performance gates

Task 20 measured the production-ready execution path in isolated benchmark runs:

```text
128-node DAG validation p95   2.742 ms   (< 50 ms)
ready dispatch p95           34.035 ms  (< 100 ms)
wake delivery p95             7.323 ms  (< 250 ms)
max observed concurrency      4 / 4
```

These numbers are evidence for the validated Task 20 worktree and are not a promise that every host/storage configuration will produce identical timings.

The improvisation acceptance suite adds explicit local-only gates for the derived-intelligence layers:

```text
health metrics snapshot p95            < 50 ms
128 KiB structured-output parse p95    < 25 ms
1000-row artifact hash lookup p95      < 50 ms
128-node workflow advisor p95          < 50 ms
100000 metric observations             < 500 ms, rolling window = 128
```

These gates are enabled with `AGENT_CORE_PERFORMANCE_GATES=1`; they are skipped by the normal regression suite so routine tests remain stable across hosts. They must be exercised locally before declaring the improvisation integration accepted. GitHub Actions/CI is not a substitute for these local gates.
