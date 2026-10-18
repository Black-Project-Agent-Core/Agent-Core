import { createHash } from 'node:crypto';
import { ARTIFACT_LIMITS, type ArtifactInspection } from './contracts.js';
import { captureArtifact } from './snapshot.js';
import { runArtifactWorker } from './worker.js';
import { ArtifactAuthorization, type ArtifactIdentity } from '../auth/artifact-authorization.js';
import { assertReadActive } from '../rdc/utils/withTimeout.js';

const digest = (value: unknown) => 'sha256:' + createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
export class ArtifactInspectionService {
  constructor(private readonly authorization: ArtifactAuthorization) {}
  async inspect(identity: ArtifactIdentity, requestId: string, revision: string,
    invocationId: string, signal?: AbortSignal,
    assertScopeCurrent?: () => Promise<void>): Promise<ArtifactInspection> {
    const active = async () => {
      assertReadActive(signal);
      await assertScopeCurrent?.();
      assertReadActive(signal);
    };
    await active();
    const lease = this.authorization.inspect(identity, requestId, revision);
    assertReadActive(signal);
    const started = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const remaining = Math.min(ARTIFACT_LIMITS.maxDurationMs, lease.expiry - started);
    if (remaining <= 0) throw new Error('ARTIFACT_LEASE_EXPIRED');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), remaining);
    timer.unref?.();
    try {
      const captured = await captureArtifact(lease.target, lease.format, lease.selected, controller.signal);
      const capturedSize = captured.archive?.byteLength
        ?? captured.files.reduce((total, item) => total + item.size, 0);
      if (captured.sha256 !== lease.boundSha || captured.scopeDigest !== lease.boundScopeDigest
        || capturedSize !== lease.boundSize) throw new Error('ARTIFACT_TARGET_CHANGED');
      await active();
      assertReadActive(controller.signal);
      const work = await runArtifactWorker(captured, lease.selected, controller.signal,
        Math.max(1, Math.min(ARTIFACT_LIMITS.maxDurationMs, lease.expiry - Date.now())));
      await active();
      assertReadActive(controller.signal);
      const freshLease = this.authorization.inspect(identity, requestId, revision);
      if (freshLease.target !== lease.target || freshLease.revision !== lease.revision)
        throw new Error('ARTIFACT_LEASE_CHANGED');
      const rechecked = await captureArtifact(lease.target, lease.format, lease.selected, controller.signal);
      if (captured.sha256 !== rechecked.sha256 || captured.scopeDigest !== rechecked.scopeDigest)
        throw new Error('ARTIFACT_TARGET_CHANGED');
      await active();
      assertReadActive(controller.signal);
      // The final capture and host scope check both await. Permission can be
      // revoked or expire during either; leave no await after this admission.
      this.authorization.inspect(identity, requestId, revision);
      const result: ArtifactInspection = {
        schemaVersion: 1, operation: 'inspect', invocationId,
        subject: { sha256: 'sha256:' + captured.sha256,
          size: captured.archive?.byteLength ?? captured.files.reduce((n,f)=>n+f.size,0),
          scopeDigest: 'sha256:' + captured.scopeDigest, format: captured.format },
        analyzer: { revision: 'artifact-static-v2', optionsDigest: digest({format:lease.format,selected:lease.selected}) },
        outcome: captured.omissions || work.unavailable || work.notExamined || work.droppedFindings ? 'partial' : 'complete',
        execution: 'settled',
        coverage: { inventory: work.inventory, selected: lease.selected.length, inspected: work.inspected,
          unavailable: work.unavailable, omitted: captured.omissions, notExamined: work.notExamined,
          returnedFindings: work.findings.length, droppedFindings: work.droppedFindings,
          findingsTruncated: work.droppedFindings > 0 },
        findings: work.findings.slice(0,ARTIFACT_LIMITS.maxFindings),
        limitations: [...(work.droppedFindings ? ['Supported static declaration findings were clipped; omitted behavior remains unknown.'] : []),
          ...work.limitations].slice(0,16),
      };
      // Omit whole findings until the complete JSON envelope fits; never slice JSON bytes.
      while (Buffer.byteLength(JSON.stringify(result),'utf8') > ARTIFACT_LIMITS.maxEnvelopeBytes
        && result.findings.length > 0) {
        result.findings.pop(); result.coverage.omitted++;
        result.coverage.returnedFindings--; result.coverage.droppedFindings++; result.coverage.findingsTruncated = true;
        result.outcome = 'partial';
      }
      if (Buffer.byteLength(JSON.stringify(result),'utf8') > ARTIFACT_LIMITS.maxEnvelopeBytes)
        throw new Error('ARTIFACT_RESULT_BUDGET');
      return result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort',onAbort);
    }
  }
}
