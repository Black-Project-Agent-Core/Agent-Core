import { Worker } from 'node:worker_threads';
import { ARTIFACT_LIMITS, type StaticInput, type ArtifactFinding } from './contracts.js';
import { readCancellationError } from '../rdc/utils/withTimeout.js';

export interface WorkerSummary {
  findings: ArtifactFinding[];
  droppedFindings: number;
  inspected: number; unavailable: number; inventory: number; notExamined: number;
  limitations: string[];
}
let workers = 0;
export function activeArtifactWorkers() { return workers; }
export async function runArtifactWorker(input: StaticInput, selected: string[], signal?: AbortSignal,
  maxMs: number = ARTIFACT_LIMITS.maxDurationMs): Promise<WorkerSummary> {
  if (workers >= ARTIFACT_LIMITS.maxWorkers) throw new Error('ARTIFACT_WORKER_BUSY');
  if (signal?.aborted) throw readCancellationError();
  workers++;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./worker-entry.js', import.meta.url), {
      workerData: { captured: input, selected },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
  } catch (error) {
    // Constructor failures also release the per-host concurrency slot.
    workers--;
    throw error;
  }
  try {
    return await new Promise<WorkerSummary>((resolve, reject) => {
      let done = false;
      const finish = (error?: Error, result?: WorkerSummary) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error('ARTIFACT_WORKER_NO_RESULT'));
      };
      const onAbort = () => finish(readCancellationError());
      const timer = setTimeout(() => finish(new Error('ARTIFACT_INSPECT_DEADLINE')), maxMs);
      timer.unref?.();
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object' || 'error' in message)
          return finish(new Error('ARTIFACT_PARSER_FAILED'));
        const r = message as WorkerSummary;
        if (!Array.isArray(r.findings) || r.findings.length > ARTIFACT_LIMITS.maxFindings
          || !Array.isArray(r.limitations) || !Number.isSafeInteger(r.inspected)
          || !Number.isSafeInteger(r.droppedFindings) || r.droppedFindings < 0)
          return finish(new Error('ARTIFACT_WORKER_INVALID_RESULT'));
        finish(undefined, r);
      });
      worker.on('error', () => finish(new Error('ARTIFACT_WORKER_FAILED')));
      worker.on('exit', (code) => finish(new Error('ARTIFACT_WORKER_EXIT_' + code)));
      if (signal?.aborted) onAbort();
    });
  } finally {
    // Await actual termination/settlement before releasing the concurrency slot.
    await worker.terminate().catch(() => undefined);
    workers--;
  }
}
