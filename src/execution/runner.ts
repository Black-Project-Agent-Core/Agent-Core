import { createHash, type Hash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { evaluateExecutionIntent } from '../runtime/command-policy.js';
import { processGovernanceCapabilities, spawnManagedCommand, terminateManagedProcessTree } from '../runtime/process-governance.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { correlationFields, currentCorrelation } from '../observability/correlation.js';
import type { ValidatedExecutionNode } from './dag.js';
import { verifyExecutionArtifacts, type ExecutionEvidenceManifest } from './evidence.js';
import type { ExecutionLogStore, ExecutionResultMarker, ExecutionResultState } from './log-store.js';
import { beginExecutionProvenance, finishExecutionProvenance, type DependencyIdentity, type ExecutionWorkflowBinding } from './provenance.js';

export interface ExecutionRunHandle {
  pid: number | null;
  completion: Promise<ExecutionResultMarker>;
  terminate(state?: 'interrupted' | 'cancelled'): void;
}

export interface ExecutionOutputAvailable {
  stream: 'stdout' | 'stderr';
  offset: number;
  nextOffset: number;
  chunkBytes: number;
}

export interface ExecutionRunOptions {
  onOutputAvailable?(event: ExecutionOutputAvailable): void | Promise<void>;
  dependencies?: DependencyIdentity[];
  workflowBinding?: ExecutionWorkflowBinding;
  projectRoot?: string;
}

export interface ExecutionCommandRunnerOptions {
  maxOutputBytes?: number;
}

interface StreamEvidence {
  bytes: number;
  hash: Hash;
}

interface SharedOutputBudget {
  limit: number;
  used: number;
  exceeded: boolean;
}

function createEvidenceTransform(
  evidence: StreamEvidence,
  stream: 'stdout' | 'stderr',
  budget: SharedOutputBudget,
  onExceeded: () => void,
  notify?: (event: ExecutionOutputAvailable) => void,
): Transform {
  return new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, budget.limit - budget.used);
      const accepted = buffer.length <= remaining ? buffer : buffer.subarray(0, remaining);
      if (accepted.length > 0) {
        const offset = evidence.bytes;
        evidence.bytes += accepted.length;
        budget.used += accepted.length;
        evidence.hash.update(accepted);
        notify?.({ stream, offset, nextOffset: evidence.bytes, chunkBytes: accepted.length });
      }
      if (buffer.length > accepted.length && !budget.exceeded) {
        budget.exceeded = true;
        onExceeded();
      }
      callback(null, accepted.length > 0 ? accepted : undefined);
    },
  });
}

async function verifyDeclaredEvidence(
  workspace: WorkspacePolicy,
  node: ValidatedExecutionNode,
): Promise<ExecutionEvidenceManifest> {
  try {
    return await verifyExecutionArtifacts(workspace, node.expectedArtifacts);
  } catch {
    return {
      verification: 'failed',
      artifacts: [],
      error: 'Declared execution artifact verification failed safely',
    };
  }
}

function terminalState(
  requested: 'interrupted' | 'cancelled' | undefined,
  timedOut: boolean,
  outputLimitExceeded: boolean,
  exitCode: number | null,
  error: Error | undefined,
): ExecutionResultState {
  if (requested) return requested;
  if (outputLimitExceeded) return 'failed';
  if (timedOut || error || exitCode !== 0) return 'failed';
  return 'succeeded';
}

async function terminateWithBoundedEscalation(child: import('node:child_process').ChildProcessWithoutNullStreams): Promise<void> {
  await terminateManagedProcessTree(child);
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = await new Promise<boolean>((resolve) => {
    const finish = (value: boolean) => {
      clearTimeout(timer);
      child.off('close', onClose);
      child.off('error', onError);
      resolve(value);
    };
    const onClose = () => finish(true);
    const onError = () => finish(true);
    const timer = setTimeout(() => finish(false), 750);
    child.once('close', onClose);
    child.once('error', onError);
  });

  if (!exited && child.exitCode === null && child.signalCode === null) {
    await terminateManagedProcessTree(child, true);
  }
}

export class ExecutionCommandRunner {
  readonly maxOutputBytes: number;

  constructor(
    readonly logs: ExecutionLogStore,
    readonly workspace: WorkspacePolicy,
    options: ExecutionCommandRunnerOptions = {},
  ) {
    const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024 * 1024;
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 1024 * 1024 * 1024) {
      throw new Error('maxOutputBytes must be an integer between 1 and 1073741824');
    }
    this.maxOutputBytes = maxOutputBytes;
  }

  async start(
    runId: string,
    node: ValidatedExecutionNode,
    attemptId: string,
    attemptNo: number,
    options: ExecutionRunOptions = {},
  ): Promise<ExecutionRunHandle> {
    const paths = await this.logs.prepareAttempt(runId, node.id, attemptNo);
    const provenance = await beginExecutionProvenance(this.workspace, node, { runId, attemptId, attemptNo,
      dependencies: options.dependencies, workflowBinding: options.workflowBinding }, options.projectRoot);
    const startedAt = Date.now();
    const activeCorrelation = currentCorrelation();
    const correlation: import('./log-store.js').ExecutionResultCorrelation | undefined = activeCorrelation ? {
      requestId: activeCorrelation.requestId,
      trace_id: activeCorrelation.traceId,
      span_id: activeCorrelation.spanId,
      trace_flags: activeCorrelation.traceFlags,
      ...(activeCorrelation.routeContextId ? { routeContextId: activeCorrelation.routeContextId } : {}),
      ...(activeCorrelation.toolName ? { toolName: activeCorrelation.toolName } : {}),
      runId,
      nodeId: node.id,
      attemptId,
    } : undefined;
    const stdoutEvidence: StreamEvidence = { bytes: 0, hash: createHash('sha256') };
    const stderrEvidence: StreamEvidence = { bytes: 0, hash: createHash('sha256') };
    const pendingOutputNotifications = new Set<Promise<void>>();
    const outputBudget: SharedOutputBudget = { limit: this.maxOutputBytes, used: 0, exceeded: false };
    let outputLimitExceeded = false;
    const notifyOutput = (event: ExecutionOutputAvailable) => {
      if (!options.onOutputAvailable) return;
      let work: Promise<void>;
      try {
        work = Promise.resolve(options.onOutputAvailable(event)).then(() => undefined, () => undefined);
      } catch {
        return;
      }
      pendingOutputNotifications.add(work);
      void work.finally(() => pendingOutputNotifications.delete(work));
    };
    const child = spawnManagedCommand(node.command, node.cwd);
    child.stdin.end();

    const onOutputExceeded = () => {
      if (outputLimitExceeded) return;
      outputLimitExceeded = true;
      void terminateWithBoundedEscalation(child);
    };

    const stdoutPipeline = pipeline(
      child.stdout,
      createEvidenceTransform(stdoutEvidence, 'stdout', outputBudget, onOutputExceeded, notifyOutput),
      createWriteStream(paths.stdoutPath, { flags: 'a' }),
    );
    const stderrPipeline = pipeline(
      child.stderr,
      createEvidenceTransform(stderrEvidence, 'stderr', outputBudget, onOutputExceeded, notifyOutput),
      createWriteStream(paths.stderrPath, { flags: 'a' }),
    );

    let requestedState: 'interrupted' | 'cancelled' | undefined;
    let timedOut = false;
    let completed = false;
    let processError: Error | undefined;
    child.once('error', (error) => { processError = error; });

    const closePromise = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });

    const timer = setTimeout(() => {
      if (completed) return;
      timedOut = true;
      void terminateWithBoundedEscalation(child);
    }, node.timeoutMs);

    const completion = (async (): Promise<ExecutionResultMarker> => {
      const terminal = await closePromise;
      clearTimeout(timer);
      const pipelineResults = await Promise.allSettled([stdoutPipeline, stderrPipeline]);
      if (pendingOutputNotifications.size > 0) {
        await Promise.allSettled([...pendingOutputNotifications]);
      }
      completed = true;
      const pipelineFailure = pipelineResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (!processError && pipelineFailure) {
        processError = pipelineFailure.reason instanceof Error
          ? pipelineFailure.reason
          : new Error(String(pipelineFailure.reason));
      }
      const finishedAt = Date.now();
      const processState = terminalState(requestedState, timedOut, outputLimitExceeded, terminal.exitCode, processError);
      const processErrorText = outputLimitExceeded
        ? `EXECUTION_OUTPUT_LIMIT_EXCEEDED: Process output exceeded configured limit of ${this.maxOutputBytes} bytes`
        : timedOut
          ? `Execution timed out after ${node.timeoutMs} ms`
          : processError?.message;
      const policy = evaluateExecutionIntent({ command: node.command, source: 'execution' });
      const governance = {
        policyCode: policy.code,
        riskClass: policy.riskClass,
        executable: policy.executable,
        interpreterClass: policy.interpreterClass,
        characteristics: policy.characteristics,
        ...processGovernanceCapabilities(),
        wallClockLimitMs: node.timeoutMs,
        outputByteLimit: this.maxOutputBytes,
      };
      const common = {
        runId,
        nodeId: node.id,
        attemptId,
        attemptNo,
        startedAt,
        finishedAt,
        exitCode: terminal.exitCode,
        signal: terminal.signal ?? null,
        stdoutBytes: stdoutEvidence.bytes,
        stderrBytes: stderrEvidence.bytes,
        stdoutSha256: stdoutEvidence.hash.digest('hex'),
        stderrSha256: stderrEvidence.hash.digest('hex'),
        governance,
        ...(correlation ? { correlation } : {}),
      };
      let marker: ExecutionResultMarker;
      if (node.expectedArtifacts.length > 0) {
        const evidence = await verifyDeclaredEvidence(this.workspace, node);
        const evidenceState = evidence.verification === 'verified' ? 'verified' : 'failed';
        const state: ExecutionResultState = processState === 'succeeded' && evidenceState === 'failed'
          ? 'failed'
          : processState;
        marker = {
          version: 2,
          ...common,
          state,
          processState,
          evidenceState,
          evidence,
          ...(processErrorText ? { error: processErrorText } : {}),
          ...(!processErrorText && processState === 'succeeded' && evidenceState === 'failed'
            ? { error: 'Required execution artifact evidence verification failed' }
            : {}),
        };
      } else {
        marker = {
          version: 1,
          ...common,
          state: processState,
          ...(processErrorText ? { error: processErrorText } : {}),
        };
      }
      try {
        marker.provenance = await finishExecutionProvenance(this.workspace, node, provenance);
        if (!marker.provenance.inputsStableDuringAttempt && marker.state === 'succeeded') {
          marker.state = 'failed';
          marker.error = 'EXECUTION_INPUTS_CHANGED_DURING_ATTEMPT';
        }
      } catch {
        marker.provenance = { ...provenance, inputsStableDuringAttempt: false };
        if (marker.state === 'succeeded') marker.state = 'failed';
        marker.error = 'EXECUTION_PROVENANCE_VERIFICATION_FAILED';
      }
      await this.logs.writeResultAtomic(marker);
      return marker;
    })();

    return {
      pid: child.pid ?? null,
      completion,
      terminate: (state = 'cancelled') => {
        if (completed || requestedState) return;
        requestedState = state;
        void terminateWithBoundedEscalation(child);
      },
    };
  }

  async run(
    runId: string,
    node: ValidatedExecutionNode,
    attemptId: string,
    attemptNo: number,
  ): Promise<ExecutionResultMarker> {
    const handle = await this.start(runId, node, attemptId, attemptNo);
    return handle.completion;
  }
}
