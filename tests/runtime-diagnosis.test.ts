import { describe, expect, it } from 'vitest';
import { diagnoseRuntime } from '../src/runtime/diagnosis.js';
import type { ResourceGovernanceDecision } from '../src/execution/resource-governor.js';

function pressureDecision(): ResourceGovernanceDecision {
  return {
    capturedAt: 10,
    requestedMaxConcurrency: 8,
    safeConcurrency: 2,
    throttled: true,
    severity: 'critical',
    reasonCodes: ['local_memory_pressure', 'audit_backlog_pressure'],
    snapshot: {
      capturedAt: 10,
      cpu: { normalizedLoad: null, available: false },
      memory: { usedRatio: 0.97, available: true },
      storage: { freeRatio: 0.5, available: true },
      backlog: { auditQueueRatio: 0.95, telemetryQueueRatio: null, queuedMemorySync: null, queuedMemorySyncAvailable: false },
      worker: { healthy: true, available: true },
    },
  };
}

describe('evidence-based runtime diagnosis', () => {
  it('emits stable bounded recommendations only when factual evidence crosses explicit conditions', () => {
    const recommendations = diagnoseRuntime({
      resourceDecision: pressureDecision(),
      github: { enabled: true, apiHealth: 'red', credentialStatus: 'missing' },
      audit: { dropped: 2, writeErrors: 1 },
      telemetry: { enabled: true, dropped: 3, lastFailureCode: 'OTLP_TIMEOUT' },
      memoryPreflightP95Ms: 151,
      executionDispatchP95Ms: 101,
      continuityBlockedTasks: 2,
      retentionCandidates: 4,
      maintenanceOverdue: true,
    });

    expect(recommendations.map((item) => item.code)).toEqual([
      'resource_pressure_active',
      'memory_latency_regression',
      'execution_dispatch_latency_regression',
      'audit_pipeline_degraded',
      'telemetry_pipeline_degraded',
      'github_credential_degraded',
      'continuity_blockers_present',
      'retention_candidates_present',
      'maintenance_overdue',
    ]);
    expect(recommendations[0]).toMatchObject({
      severity: 'critical',
      reasonCodes: ['local_memory_pressure', 'audit_backlog_pressure'],
      evidenceRefs: ['resourceGovernance.decision'],
    });
    expect(recommendations.every((item) => item.evidenceRefs.length > 0)).toBe(true);
    expect(recommendations.every((item) => item.recommendation.length > 0)).toBe(true);
    const serialized = JSON.stringify(recommendations);
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('principal');
  });

  it('does not invent recommendations when evidence is healthy, absent, or below the established thresholds', () => {
    expect(diagnoseRuntime({
      resourceDecision: { ...pressureDecision(), safeConcurrency: 8, throttled: false, severity: 'none', reasonCodes: [] },
      github: { enabled: true, apiHealth: 'green', credentialStatus: 'valid' },
      audit: { dropped: 0, writeErrors: 0 },
      telemetry: { enabled: false, dropped: 0 },
      memoryPreflightP95Ms: 150,
      executionDispatchP95Ms: 100,
      continuityBlockedTasks: 0,
      retentionCandidates: 0,
      maintenanceOverdue: false,
    })).toEqual([]);
  });
});
