import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type { ExecutionArtifactType } from './dag.js';
import type { ExecutionLogStore } from './log-store.js';
import { executionNodeSpec } from './scheduler.js';
import { executionApplicability, executionIdentityHash, type ExecutionApplicability, type ExecutionWorkflowBinding } from './provenance.js';
import type { ExecutionArtifactRecord, ExecutionArtifactQuery, ExecutionStore } from './store.js';
import type { ExecutionScope } from './types.js';

export interface IndexedExecutionArtifact {
  artifactId: string;
  runId: string;
  nodeId: string;
  attemptNo: number;
  path: string;
  artifactType: ExecutionArtifactType;
  verification: 'verified';
  sha256?: string;
  size?: number;
  modifiedAt?: number;
  sourceResultRef: string;
  createdAt: number;
}

export interface ArtifactReuseResult {
  found: boolean;
  advisoryOnly: true;
  stillExists?: boolean;
  stillVerified?: boolean;
  artifact?: IndexedExecutionArtifact;
  applicability?: ExecutionApplicability;
}

export interface PurgeSuggestion extends IndexedExecutionArtifact {
  reason: string;
  safeToReview: true;
}

function mapArtifact(record: ExecutionArtifactRecord): IndexedExecutionArtifact {
  const { metadata, ...rest } = record;
  void metadata;
  return rest;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export class ExecutionArtifactManager {
  constructor(
    readonly store: ExecutionStore,
    readonly workspace: WorkspacePolicy,
    readonly logs?: ExecutionLogStore,
    readonly metrics?: RuntimeMetricRegistry,
  ) {}

  async indexAttempt(scope: ExecutionScope, runId: string, nodeId: string, attemptNo: number): Promise<IndexedExecutionArtifact[]> {
    const started = performance.now();
    try {
      const run = await this.store.getRun(scope, runId);
      if (!run) throw new Error('EXECUTION_RUN_NOT_FOUND');
      const existing = await this.findByRun(scope, runId, nodeId, attemptNo);
      if (existing.length > 0) return existing;
      if (!this.logs) return [];
      const marker = await this.logs.readResult(runId, nodeId, attemptNo);
      if (!marker || marker.version !== 2 || marker.evidenceState !== 'verified' || marker.evidence.verification !== 'verified') return [];
      const attempt = (await this.store.listAttempts(scope, runId, nodeId)).find((item) => item.attemptNo === attemptNo);
      if (!attempt || marker.attemptId !== attempt.attemptId || marker.state !== 'succeeded' || attempt.state !== 'succeeded') return [];
      await this.store.recordArtifacts(scope, runId, nodeId, attemptNo, attempt.resultPath, marker.evidence.artifacts
        .filter((artifact) => artifact.verification === 'verified' && artifact.exists)
        .map((artifact) => ({
          path: artifact.path,
          artifactType: artifact.artifactType ?? 'other',
          ...(artifact.sha256 ? { sha256: artifact.sha256 } : {}),
          ...(artifact.size === undefined ? {} : { size: artifact.size }),
          ...(artifact.modifiedAt === undefined ? {} : { modifiedAt: artifact.modifiedAt }),
          metadata: { required: artifact.required, actualKind: artifact.actualKind ?? null },
        })));
      return this.findByRun(scope, runId, nodeId, attemptNo);
    } catch (error) {
      this.metrics?.failure('execution.artifact_index.duration_ms', error instanceof Error ? error.name : 'EXECUTION_ARTIFACT_INDEX_FAILED');
      throw error;
    } finally {
      this.metrics?.observe('execution.artifact_index.duration_ms', Math.max(0, performance.now() - started));
    }
  }

  async reconcile(limit = 1000): Promise<{ candidates: number; indexed: number; failed: number }> {
    const candidates = await this.store.listArtifactIndexCandidates(limit);
    let indexed = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const scope: ExecutionScope = {
        principalId: candidate.principalId,
        ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
      };
      try {
        const before = await this.findByRun(scope, candidate.runId, candidate.nodeId, candidate.attemptNo);
        const after = await this.indexAttempt(scope, candidate.runId, candidate.nodeId, candidate.attemptNo);
        if (before.length === 0 && after.length > 0) indexed += 1;
      } catch {
        failed += 1;
      }
    }
    return { candidates: candidates.length, indexed, failed };
  }

  async findByHash(scope: ExecutionScope, hash: string): Promise<IndexedExecutionArtifact[]> {
    const normalized = hash.toLowerCase().trim();
    if (!/^[a-f0-9]{64}$/.test(normalized)) return [];
    return this.query(scope, { sha256: normalized });
  }

  async findByType(scope: ExecutionScope, artifactType: ExecutionArtifactType): Promise<IndexedExecutionArtifact[]> {
    if (!['build', 'test_report', 'log', 'data', 'other'].includes(artifactType)) return [];
    return this.query(scope, { artifactType });
  }

  async findByRun(scope: ExecutionScope, runId: string, nodeId?: string, attemptNo?: number): Promise<IndexedExecutionArtifact[]> {
    return this.query(scope, {
      runId,
      ...(nodeId ? { nodeId } : {}),
      ...(attemptNo === undefined ? {} : { attemptNo }),
    });
  }

  async findReusable(
    scope: ExecutionScope,
    input: { sha256: string; excludeRunId?: string },
  ): Promise<ArtifactReuseResult> {
    const candidates = await this.findByHash(scope, input.sha256);
    for (const candidate of candidates) {
      if (input.excludeRunId && candidate.runId === input.excludeRunId) continue;
      if (!candidate.sha256) continue;
      try {
        const resolved = await this.workspace.resolveExisting(candidate.path);
        const info = await stat(resolved);
        if (!info.isFile()) continue;
        if (await sha256(resolved) !== candidate.sha256) continue;
        let applicability: ExecutionApplicability = 'legacy_unbound';
        if (this.logs) {
          const run = await this.store.getRun(scope, candidate.runId);
          const node = await this.store.getNode(scope, candidate.runId, candidate.nodeId);
          const attempt = (await this.store.listAttempts(scope, candidate.runId, candidate.nodeId)).find((item) => item.attemptNo === candidate.attemptNo);
          const marker = await this.logs.readResult(candidate.runId, candidate.nodeId, candidate.attemptNo);
          if (!run || !node || !attempt || !marker || marker.attemptId !== attempt.attemptId || node.attemptCount !== candidate.attemptNo) continue;
          const dependencies = [];
          for (const nodeId of node.dependsOn) {
            const dependency = await this.store.getNode(scope, run.runId, nodeId);
            if (!dependency || dependency.state !== 'succeeded') throw new Error('EXECUTION_DEPENDENCY_NOT_SUCCEEDED');
            const result = await this.logs.readResult(run.runId, nodeId, dependency.attemptCount);
            if (!result) throw new Error('EXECUTION_DEPENDENCY_EVIDENCE_MISSING');
            dependencies.push({ nodeId, attemptNo: result.attemptNo, attemptId: result.attemptId, resultHash: executionIdentityHash(result) });
          }
          applicability = await executionApplicability(this.workspace, executionNodeSpec(node), marker.provenance,
            { runId: candidate.runId, attemptId: attempt.attemptId, attemptNo: attempt.attemptNo }, dependencies,
            run.metadata.workflowBinding as ExecutionWorkflowBinding | undefined);
          if (applicability !== 'current' && applicability !== 'legacy_unbound') continue;
        }
        return { found: true, advisoryOnly: true, stillExists: true, stillVerified: true, artifact: candidate, applicability };
      } catch {
        continue;
      }
    }
    return { found: false, advisoryOnly: true };
  }

  async suggestPurge(scope: ExecutionScope, options: { olderThanMs?: number; limit?: number } = {}): Promise<PurgeSuggestion[]> {
    const olderThanMs = Math.max(0, options.olderThanMs ?? 30 * 24 * 60 * 60 * 1000);
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    const artifacts = await this.query(scope, {
      terminalRunsOnly: true,
      createdAtMax: Date.now() - olderThanMs,
      order: 'oldest',
      limit,
    });
    return artifacts.map((artifact) => ({
      ...artifact,
      reason: `terminal artifact older than or equal to ${olderThanMs} ms; review only`,
      safeToReview: true,
    }));
  }

  private async query(scope: ExecutionScope, filter: ExecutionArtifactQuery): Promise<IndexedExecutionArtifact[]> {
    return (await this.store.listArtifacts(scope, filter)).map(mapArtifact);
  }
}
