# Agent Core Wave F — Adaptive Resource Governance Design

## Status

Approved implementation direction for Wave F. This design extends the local deterministic control plane only; it does not add external AI models, cloud reasoning agents, embedding/reranking APIs, or hidden fallbacks.

Baseline source: `047c62f112982ec0f33cd36b5cd133e39906015e`.

## Goal

Let Agent Core reduce local execution dispatch pressure when factual local resource signals are unhealthy, expose bounded evidence-based diagnosis, and optionally run safe local maintenance checks without changing factual execution semantics or automatically performing destructive maintenance.

## Non-goals

- never increase concurrency above the operator/run maximum;
- never infer process success/failure from resource pressure;
- never cancel or terminate already-running nodes solely because pressure rises;
- never auto-apply retention deletion, restore a database, delete backups, rotate credentials, or perform another destructive maintenance action;
- never add an external AI/model/API dependency;
- do not change the MCP tool count solely for Wave F; extend the existing health/status surfaces instead;
- do not refactor unrelated large execution/memory modules.

## Architecture

Wave F uses a policy-driven governor rather than embedding host heuristics directly into the scheduler.

```text
Node/local facts
  -> ResourceSnapshotProvider
  -> ResourceGovernor (pure deterministic policy)
  -> ExecutionScheduler dispatch ceiling only
  -> persisted transition events + bounded metrics

Runtime health + resource decision + maintenance facts
  -> RuntimeDiagnosisService
  -> bounded recommendations with reason codes/evidence refs
  -> existing agent_core_health_metrics surface

Optional local timer
  -> LocalMaintenanceCoordinator
  -> integrity checks + retention dry-run only
  -> bounded status + audit evidence
```

### 1. Resource snapshot

Create `src/runtime/resource-snapshot.ts`.

```ts
export interface ResourceSnapshot {
  capturedAt: number;
  cpu: { normalizedLoad: number | null; available: boolean };
  memory: { usedRatio: number | null; available: boolean };
  storage: { freeRatio: number | null; available: boolean };
  backlog: {
    auditQueueRatio: number | null;
    telemetryQueueRatio: number | null;
    queuedMemorySync: number | null;
    queuedMemorySyncAvailable: boolean;
  };
  worker: { healthy: boolean | null; available: boolean };
}

export interface ResourceSnapshotProvider {
  snapshot(): Promise<ResourceSnapshot>;
}
```

Production facts:

- CPU: one-minute host load divided by logical CPU count when the platform reports a useful load average; otherwise `null/available=false` and CPU does not throttle.
- Memory: `1 - freeMemory / totalMemory` when total memory is valid.
- Storage: `statfs` free/total blocks for the execution persistence root; failure produces unknown rather than invented pressure.
- Audit/telemetry backlog: queue depth divided by queue capacity when the corresponding bounded queue is enabled.
- Execution evidence/memory-sync backlog: factual `queuedSync` count from `ExecutionStore.systemCounts()`; probe failure is `null/available=false`, never fabricated zero.
- Worker health: local execution service/store health only; probe failure is `healthy=null/available=false`, no remote probe.

Snapshot capture is injectable in tests. Host timing is never used to prove policy correctness.

### 2. Adaptive concurrency policy

Add resource-governance configuration under `ExecutionConfig`:

```ts
resourceGovernance: {
  enabled: boolean;                 // default true
  minimumConcurrency: number;       // default 1
  cpuWarningRatio: number;          // default 0.90
  cpuCriticalRatio: number;         // default 1.25
  memoryWarningRatio: number;       // default 0.85
  memoryCriticalRatio: number;      // default 0.95
  storageWarningFreeRatio: number;  // default 0.15
  storageCriticalFreeRatio: number; // default 0.05
  auditWarningRatio: number;        // default 0.75
  auditCriticalRatio: number;       // default 0.90
  telemetryWarningRatio: number;    // default 0.75
  telemetryCriticalRatio: number;   // default 0.90
  queuedSyncWarning: number;        // default 32
  queuedSyncCritical: number;       // default 128
}
```

Create `src/execution/resource-governor.ts`.

```ts
export type ResourceThrottleReasonCode =
  | 'local_cpu_pressure'
  | 'local_memory_pressure'
  | 'local_storage_pressure'
  | 'audit_backlog_pressure'
  | 'telemetry_backlog_pressure'
  | 'execution_sync_backlog_pressure'
  | 'execution_worker_degraded';

export interface ResourceGovernanceDecision {
  capturedAt: number;
  requestedMaxConcurrency: number;
  safeConcurrency: number;
  throttled: boolean;
  severity: 'none' | 'warning' | 'critical';
  reasonCodes: ResourceThrottleReasonCode[];
  snapshot: ResourceSnapshot;
}
```

Deterministic rule:

1. Clamp the requested/run concurrency to the configured operator maximum before policy is applied.
2. When governance is disabled, return that clamped maximum unchanged.
3. A critical signal sets the safe ceiling to `minimumConcurrency`.
4. Warning-only pressure sets the safe ceiling to `max(minimumConcurrency, ceil(requestedMax / 2))`.
5. No pressure returns the requested maximum.
6. Unknown signals never manufacture a reason code and never reduce concurrency.
7. Multiple signals are retained as a stable, de-duplicated reason-code list.
8. `safeConcurrency` can never exceed the run maximum or configured operator maximum.

### 3. Scheduler integration

`ExecutionScheduler` receives an optional governor dependency. Before calculating new dispatch slots it gets one decision for that reconciliation pass.

```text
runningCount may already exceed a newly reduced safe ceiling
=> dispatch zero new nodes
=> do not terminate existing nodes
=> factual node/run state remains unchanged
```

The scheduler records transition evidence, not a noisy event on every pass:

- `run.resource_throttled` when a run enters pressure or the pressure signature changes;
- `run.resource_recovered` when a previously throttled run returns to its requested ceiling.

Payload is bounded to `safeConcurrency`, `requestedMaxConcurrency`, `severity`, and `reasonCodes`; no raw host paths or process output.

Metrics:

```text
execution.resource.safe_concurrency
execution.resource_throttle.count
execution.resource_recovery.count
execution.resource_snapshot.duration_ms
```

The scheduler remains deterministic for identical injected snapshots and DAG state.

### 4. Runtime observability and diagnosis

Do not add a new MCP tool. Extend `agent_core_health_metrics` and its underlying `RuntimeHealthMetrics` snapshot with:

```ts
resourceGovernance: {
  enabled: boolean;
  configuredMaxConcurrency: number;
  decision: ResourceGovernanceDecision;
};
maintenance: LocalMaintenanceStatus;
diagnosis: RuntimeDiagnosisRecommendation[];
```

Create `src/runtime/diagnosis.ts` as a pure bounded classifier. Recommendations must include a stable code, severity, reason codes, and evidence refs. Initial categories:

- `resource_pressure_active`;
- `github_credential_degraded`;
- `audit_pipeline_degraded`;
- `telemetry_pipeline_degraded`;
- `memory_latency_regression` when preflight p95 exceeds the established 150 ms quality target;
- `execution_dispatch_latency_regression` when dispatch p95 exceeds the established 100 ms performance target;
- `continuity_blockers_present` when an authenticated MCP scope exposes blocked tasks;
- `retention_candidates_present` when scheduled dry-run maintenance reports candidates;
- `maintenance_overdue` when enabled maintenance misses its configured next-run window.

For authenticated MCP health reads, `RuntimeHealthMetrics.getMetrics(scope)` may enrich diagnosis with bounded continuity counts. HTTP metrics without a principal remain global and omit principal-specific diagnosis rather than guessing.

Recommendations never execute actions.

### 5. Optional scheduled local maintenance

Create `src/runtime/maintenance.ts` and a top-level `MaintenanceConfig`:

```ts
interface MaintenanceConfig {
  enabled: boolean;                    // default false
  intervalMs: number;                  // default 6h
  retentionOlderThanMs: number;        // default 30d
  retentionPlanRoot: string;
}
```

`LocalMaintenanceCoordinator` owns one unref'd timer and an injectable clock/scheduler in tests. A run performs only operations safe while the runtime is live:

- memory integrity/status check;
- execution integrity/status check;
- execution raw-log retention **dry-run plan**;
- bounded status/audit recording.

It deliberately has no code path to call `applyExecutionRetention`, restore a recovery bundle, delete/rotate backups, revoke credentials, or remove helper files. Backup creation remains an explicit operator CLI action because the live execution runtime lease intentionally prevents concurrent backup/recovery maintenance. Diagnosis may report that a backup is recommended; Wave F does not weaken the lease to automate it.

This makes the destructive-maintenance exit gate structural rather than relying on a permissive flag.

### 6. Runtime wiring and lifecycle

`createRuntimeServices` creates one shared snapshot provider and governor using existing execution store, audit status, telemetry status, and metrics. `ExecutionService` receives the governor as a dependency. `RuntimeHealthMetrics` receives the same governor and maintenance coordinator, so scheduler decisions and reported observability share the same factual policy implementation.

`startAgentCoreService` starts the maintenance coordinator only after memory/execution startup succeeds and closes it before runtime shutdown. Disabled maintenance has no timer.

### 7. Tool/protocol compatibility

Wave F preserves the existing MCP surface count. No new mutation tool is required.

`agent_core_capabilities` advances its internal stage label and lists:

```text
execution.adaptive_resource_governance
runtime.evidence_based_diagnosis
maintenance.local_safe_schedule
```

Legacy `2025-11-25` and modern `2026-07-28` must continue to expose the same tool count and behavior.

## Failure behavior

- Snapshot probe error: mark that signal unavailable; do not invent pressure.
- Complete snapshot provider failure: governor fails open to the bounded requested maximum, records a metric failure code, and never exceeds operator max.
- Health/diagnosis enrichment failure: health metrics remain available with bounded degraded recommendation/status rather than failing MCP.
- Maintenance task failure: record bounded failure reason; do not retry in a tight loop; next configured interval remains the next opportunity.
- Scheduler resource pressure never changes terminal truth, artifact verification, result markers, or retry semantics.

## Security and privacy

- no credentials, raw command output, request IDs, trace IDs, filesystem secrets, or full audit hashes in resource/diagnosis payloads;
- all ratios/counts are bounded scalar facts;
- no external network request is introduced by the governor or maintenance coordinator;
- GitHub diagnosis reuses the existing bounded GitHub probe only.

## Acceptance gates

```text
operator max concurrency never exceeded                PASS required
warning snapshot reduces only new dispatch              PASS required
critical snapshot reduces only new dispatch to min      PASS required
running nodes never killed by pressure                  PASS required
throttle/recovery reason events persisted               PASS required
identical snapshots -> identical decisions              PASS required
unknown resource facts fail open within operator max    PASS required
resource metrics bounded / no identifiers               PASS required
diagnosis contains evidence refs and no auto-actions    PASS required
maintenance disabled by default                         PASS required
scheduled maintenance has no destructive call path      PASS required
runtime lease semantics unchanged                       PASS required
MCP legacy/modern tool surface unchanged                PASS required
Wave E quality gate preserved                           PASS required
full release regression                                 PASS required
external AI model/API dependency                        0
```

## Baseline evidence — 2026-08-31

Fresh worktree from `047c62f`:

```text
npm ci                                      PASS / 0 vulnerabilities
first verify:release                        one execution-retention 15s timeout under full-suite load
focused execution-retention reruns          5/5 PASS (~2.3s suite each)
second fresh verify:release                 PASS
full regression                             130 files / 627 tests PASS / 38 skips
quality:gate                                PASS
release metadata                            PASS
doc links                                   PASS
```

No production or test code was changed to make the second baseline pass. The initial timeout is retained as an observed load-flake datum and is not treated as a Wave F feature failure without reproducible evidence.
