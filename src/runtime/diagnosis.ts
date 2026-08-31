import type { ResourceGovernanceDecision } from '../execution/resource-governor.js';

export type RuntimeDiagnosisSeverity = 'info' | 'warning' | 'critical';

export type RuntimeDiagnosisCode =
  | 'resource_pressure_active'
  | 'memory_latency_regression'
  | 'execution_dispatch_latency_regression'
  | 'audit_pipeline_degraded'
  | 'telemetry_pipeline_degraded'
  | 'github_credential_degraded'
  | 'continuity_blockers_present'
  | 'retention_candidates_present'
  | 'maintenance_overdue';

export interface RuntimeDiagnosisRecommendation {
  code: RuntimeDiagnosisCode;
  severity: RuntimeDiagnosisSeverity;
  reasonCodes: string[];
  evidenceRefs: string[];
  recommendation: string;
}

export interface RuntimeDiagnosisFacts {
  resourceDecision?: ResourceGovernanceDecision | null;
  github?: {
    enabled: boolean;
    apiHealth: string;
    credentialStatus: string;
  };
  audit?: { dropped: number; writeErrors: number };
  telemetry?: { enabled: boolean; dropped: number; lastFailureCode?: string };
  memoryPreflightP95Ms?: number | null;
  executionDispatchP95Ms?: number | null;
  continuityBlockedTasks?: number;
  retentionCandidates?: number;
  maintenanceOverdue?: boolean;
}

function finitePositive(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function diagnoseRuntime(facts: RuntimeDiagnosisFacts): RuntimeDiagnosisRecommendation[] {
  const output: RuntimeDiagnosisRecommendation[] = [];
  const resource = facts.resourceDecision;
  if (resource && resource.severity !== 'none') {
    output.push({
      code: 'resource_pressure_active',
      severity: resource.severity === 'critical' ? 'critical' : 'warning',
      reasonCodes: [...resource.reasonCodes],
      evidenceRefs: ['resourceGovernance.decision'],
      recommendation: 'Reduce new execution dispatch until local resource pressure recovers.',
    });
  }

  if (finitePositive(facts.memoryPreflightP95Ms) > 150) {
    output.push({
      code: 'memory_latency_regression',
      severity: 'warning',
      reasonCodes: ['memory_preflight_p95_above_150ms'],
      evidenceRefs: ['memory.preflight.p95Ms'],
      recommendation: 'Inspect local memory-store pressure and recent recall workload before increasing execution load.',
    });
  }

  if (finitePositive(facts.executionDispatchP95Ms) > 100) {
    output.push({
      code: 'execution_dispatch_latency_regression',
      severity: 'warning',
      reasonCodes: ['execution_dispatch_p95_above_100ms'],
      evidenceRefs: ['execution.dispatch.p95Ms'],
      recommendation: 'Inspect local execution backlog and resource pressure before raising concurrency.',
    });
  }

  const auditDropped = finitePositive(facts.audit?.dropped);
  const auditWriteErrors = finitePositive(facts.audit?.writeErrors);
  if (auditDropped > 0 || auditWriteErrors > 0) {
    output.push({
      code: 'audit_pipeline_degraded',
      severity: auditWriteErrors > 0 ? 'critical' : 'warning',
      reasonCodes: [
        ...(auditDropped > 0 ? ['audit_records_dropped'] : []),
        ...(auditWriteErrors > 0 ? ['audit_write_errors'] : []),
      ],
      evidenceRefs: ['audit.dropped', 'audit.writeErrors'],
      recommendation: 'Inspect the local audit journal and storage health before relying on new maintenance or mutation evidence.',
    });
  }

  const telemetryDropped = finitePositive(facts.telemetry?.dropped);
  if (facts.telemetry?.enabled && (telemetryDropped > 0 || Boolean(facts.telemetry.lastFailureCode))) {
    output.push({
      code: 'telemetry_pipeline_degraded',
      severity: 'warning',
      reasonCodes: [
        ...(telemetryDropped > 0 ? ['telemetry_records_dropped'] : []),
        ...(facts.telemetry.lastFailureCode ? ['telemetry_export_failure'] : []),
      ],
      evidenceRefs: ['observability.telemetry'],
      recommendation: 'Inspect the local loopback telemetry exporter; audit evidence remains authoritative.',
    });
  }

  if (facts.github?.enabled && ['missing', 'invalid'].includes(facts.github.credentialStatus)) {
    output.push({
      code: 'github_credential_degraded',
      severity: 'warning',
      reasonCodes: [`github_credential_${facts.github.credentialStatus}`],
      evidenceRefs: ['github.credentialStatus'],
      recommendation: 'Restore the repository-scoped GitHub credential before GitHub mutations are attempted.',
    });
  }

  if (finitePositive(facts.continuityBlockedTasks) > 0) {
    output.push({
      code: 'continuity_blockers_present',
      severity: 'warning',
      reasonCodes: ['continuity_blocked_tasks_present'],
      evidenceRefs: ['continuity.blockedTasks'],
      recommendation: 'Inspect the bounded continuity blockers before starting dependent work.',
    });
  }

  if (finitePositive(facts.retentionCandidates) > 0) {
    output.push({
      code: 'retention_candidates_present',
      severity: 'info',
      reasonCodes: ['execution_retention_candidates_present'],
      evidenceRefs: ['maintenance.retentionCandidates'],
      recommendation: 'Review the local retention dry-run plan before any explicit retention apply action.',
    });
  }

  if (facts.maintenanceOverdue === true) {
    output.push({
      code: 'maintenance_overdue',
      severity: 'warning',
      reasonCodes: ['maintenance_schedule_overdue'],
      evidenceRefs: ['maintenance.nextRunAt'],
      recommendation: 'Inspect the local maintenance scheduler state and run safe checks when appropriate.',
    });
  }

  return output;
}
