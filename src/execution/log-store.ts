import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExecutionEvidenceManifest } from './evidence.js';
import { executionIdentityHash, type ExecutionProvenance } from './provenance.js';
import type { OutputTextSegment } from './output-projection.js';

export interface ExecutionAttemptPaths {
  directory: string;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
}

export interface ExecutionLogReadResult {
  data: string;
  offset: number;
  nextOffset: number;
  totalBytes: number;
  eof: boolean;
}

export interface ExecutionLogAnalysisCoverage {
  strategy: 'full' | 'head_tail';
  totalBytes: number;
  examinedBytes: number;
  omittedBytes: number;
  ranges: Array<{ start: number; end: number }>;
}

export interface ExecutionLogAnalysis {
  coverage: ExecutionLogAnalysisCoverage;
  segments: OutputTextSegment[];
}

export type ExecutionResultState = 'succeeded' | 'failed' | 'interrupted' | 'cancelled';

export interface ExecutionGovernanceEvidence {
  policyCode: string;
  riskClass: string;
  executable: string;
  interpreterClass: string;
  characteristics: string[];
  processTreeTermination: 'windows_taskkill_tree' | 'posix_process_group';
  hardWallClockLimit: true;
  hardOutputByteLimit: true;
  hardCpuTimeLimit: false;
  hardMemoryLimit: false;
  wallClockLimitMs: number;
  outputByteLimit: number;
}

export interface ExecutionResultCorrelation {
  requestId: string;
  trace_id: string;
  span_id: string;
  trace_flags: string;
  routeContextId?: string;
  toolName?: string;
  runId?: string;
  nodeId?: string;
  attemptId?: string;
}

export interface ExecutionResultMarkerBase {
  runId: string;
  nodeId: string;
  attemptId: string;
  attemptNo: number;
  state: ExecutionResultState;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  signal: string | null;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutSha256: string;
  stderrSha256: string;
  error?: string;
  governance?: ExecutionGovernanceEvidence;
  provenance?: ExecutionProvenance;
}

export interface ExecutionResultMarkerV1 extends ExecutionResultMarkerBase {
  version: 1;
}

export interface ExecutionResultMarkerV2 extends ExecutionResultMarkerBase {
  version: 2;
  processState: ExecutionResultState;
  evidenceState: 'verified' | 'failed';
  evidence: ExecutionEvidenceManifest;
}

export type ExecutionResultMarker = ExecutionResultMarkerV1 | ExecutionResultMarkerV2;

export class ExecutionLogStoreError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionLogStoreError';
  }
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;
const MAX_LOG_READ_BYTES = 1024 * 1024;

function fail(code: string, message: string): never {
  throw new ExecutionLogStoreError(code, message);
}

function segment(value: string, field: string): string {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    fail('EXECUTION_LOG_ID_INVALID', `${field} is not a safe path segment`);
  }
  return value;
}

function attemptNumber(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 999_999) {
    fail('EXECUTION_ATTEMPT_NUMBER_INVALID', 'attemptNo must be an integer between 1 and 999999');
  }
  return value;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export class ExecutionLogStore {
  readonly root: string;

  constructor(root: string) {
    if (typeof root !== 'string' || !root.trim()) fail('EXECUTION_LOG_ROOT_REQUIRED', 'Execution log root is required');
    this.root = path.resolve(root);
  }

  paths(runId: string, nodeId: string, attemptNo: number): ExecutionAttemptPaths {
    const safeRunId = segment(runId, 'runId');
    const safeNodeId = segment(nodeId, 'nodeId');
    const safeAttemptNo = attemptNumber(attemptNo);
    const directory = path.join(this.root, safeRunId, safeNodeId);
    const stem = `attempt-${String(safeAttemptNo).padStart(3, '0')}`;
    return {
      directory,
      stdoutPath: path.join(directory, `${stem}.stdout.log`),
      stderrPath: path.join(directory, `${stem}.stderr.log`),
      resultPath: path.join(directory, `${stem}.result.json`),
    };
  }

  async prepareAttempt(runId: string, nodeId: string, attemptNo: number): Promise<ExecutionAttemptPaths> {
    const paths = this.paths(runId, nodeId, attemptNo);
    await mkdir(paths.directory, { recursive: true });
    if (await exists(paths.stdoutPath) || await exists(paths.stderrPath) || await exists(paths.resultPath)) {
      fail('EXECUTION_ATTEMPT_EXISTS', `Attempt evidence already exists for ${runId}/${nodeId}/${attemptNo}`);
    }
    try {
      await writeFile(paths.stdoutPath, '', { encoding: 'utf8', flag: 'wx' });
      await writeFile(paths.stderrPath, '', { encoding: 'utf8', flag: 'wx' });
      return paths;
    } catch (error) {
      await rm(paths.stdoutPath, { force: true }).catch(() => undefined);
      await rm(paths.stderrPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async readLog(
    runId: string,
    nodeId: string,
    attemptNo: number,
    stream: 'stdout' | 'stderr',
    offset = 0,
    maxBytes = 64 * 1024,
  ): Promise<ExecutionLogReadResult> {
    if (stream !== 'stdout' && stream !== 'stderr') fail('EXECUTION_LOG_STREAM_INVALID', 'stream must be stdout or stderr');
    if (!Number.isInteger(offset) || offset < 0) fail('EXECUTION_LOG_OFFSET_INVALID', 'offset must be a non-negative integer');
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_LOG_READ_BYTES) {
      fail('EXECUTION_LOG_READ_LIMIT_INVALID', `maxBytes must be between 1 and ${MAX_LOG_READ_BYTES}`);
    }
    const paths = this.paths(runId, nodeId, attemptNo);
    const target = stream === 'stdout' ? paths.stdoutPath : paths.stderrPath;
    const info = await stat(target);
    const totalBytes = info.size;
    if (offset > totalBytes) fail('EXECUTION_LOG_OFFSET_INVALID', 'offset is beyond the end of the log');
    if (offset === totalBytes) return { data: '', offset, nextOffset: offset, totalBytes, eof: true };

    const length = Math.min(maxBytes, totalBytes - offset);
    const buffer = Buffer.alloc(length);
    const handle = await open(target, 'r');
    try {
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      const nextOffset = offset + bytesRead;
      return {
        data: buffer.subarray(0, bytesRead).toString('utf8'),
        offset,
        nextOffset,
        totalBytes,
        eof: nextOffset >= totalBytes,
      };
    } finally {
      await handle.close();
    }
  }

  /** Hash the original bytes while retaining bounded, complete-line analysis windows. */
  async readAnalysis(
    marker: ExecutionResultMarker,
    stream: 'stdout' | 'stderr',
    budget = 128 * 1024,
  ): Promise<ExecutionLogAnalysis> {
    if (stream !== 'stdout' && stream !== 'stderr') fail('EXECUTION_LOG_STREAM_INVALID', 'Invalid analysis stream');
    if (!Number.isSafeInteger(budget) || budget < 2 || budget > MAX_LOG_READ_BYTES) {
      fail('EXECUTION_LOG_READ_LIMIT_INVALID', 'Analysis window must be between 2 and 1048576 bytes');
    }
    const totalBytes = stream === 'stdout' ? marker.stdoutBytes : marker.stderrBytes;
    const expectedHash = stream === 'stdout' ? marker.stdoutSha256 : marker.stderrSha256;
    if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > 1024 * 1024 * 1024
      || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      fail('EXECUTION_LOG_ANALYSIS_MARKER_INVALID', 'Invalid terminal output byte count or hash');
    }
    const paths = this.paths(marker.runId, marker.nodeId, marker.attemptNo);
    const target = stream === 'stdout' ? paths.stdoutPath : paths.stderrPath;
    const handle = await open(target, 'r');
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== totalBytes) {
        fail('EXECUTION_LOG_INTEGRITY_MISMATCH', 'Raw output size differs from the terminal marker');
      }
      const strategy = totalBytes <= budget ? 'full' : 'head_tail';
      const headSize = Math.floor(budget / 2);
      const windows = (strategy === 'full'
        ? [{ start: 0, end: totalBytes }]
        : [{ start: 0, end: headSize }, { start: totalBytes - (budget - headSize), end: totalBytes }])
        .map(range => ({ ...range, bytes: Buffer.alloc(range.end - range.start), startsAtLine: range.start === 0 }));
      const hash = createHash('sha256');
      const chunk = Buffer.alloc(64 * 1024);
      let offset = 0;
      while (offset < totalBytes) {
        const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, totalBytes - offset), offset);
        if (!bytesRead) fail('EXECUTION_LOG_INTEGRITY_MISMATCH', 'Raw output ended before its terminal byte count');
        hash.update(chunk.subarray(0, bytesRead));
        for (const window of windows) {
          if (window.start > offset && window.start - 1 < offset + bytesRead) {
            window.startsAtLine = chunk[window.start - 1 - offset] === 10;
          }
          const start = Math.max(offset, window.start), end = Math.min(offset + bytesRead, window.end);
          if (start < end) chunk.copy(window.bytes, start - window.start, start - offset, end - offset);
        }
        offset += bytesRead;
      }
      const [after, currentPath] = await Promise.all([handle.stat(), stat(target)]);
      if (hash.digest('hex') !== expectedHash || after.size !== totalBytes
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || currentPath.ino !== after.ino || currentPath.dev !== after.dev || currentPath.size !== totalBytes) {
        fail('EXECUTION_LOG_INTEGRITY_MISMATCH', 'Raw output no longer matches its terminal marker');
      }
      const segments: OutputTextSegment[] = [];
      for (const window of windows) {
        let start = 0, end = window.bytes.length;
        // A cut line is not a valid diagnostic or test-summary observation.
        if (!window.startsAtLine) {
          const newline = window.bytes.indexOf(10);
          start = newline < 0 ? end : newline + 1;
        }
        if (window.end < totalBytes) {
          const newline = window.bytes.lastIndexOf(10);
          end = newline < 0 ? 0 : newline + 1;
        }
        if (start >= end) continue;
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(window.bytes.subarray(start, end)); }
        catch { fail('EXECUTION_LOG_ENCODING_UNSUPPORTED', 'Output analysis requires valid UTF-8; original bytes remain available'); }
        segments.push({ stream, start: window.start + start, end: window.start + end, text });
      }
      const ranges = segments.map(({ start, end }) => ({ start, end }));
      const examinedBytes = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
      return { segments, coverage: { strategy, totalBytes, examinedBytes, omittedBytes: totalBytes - examinedBytes, ranges } };
    } finally {
      await handle.close();
    }
  }

  async readResult(runId: string, nodeId: string, attemptNo: number): Promise<ExecutionResultMarker | null> {
    const paths = this.paths(runId, nodeId, attemptNo);
    let body: string;
    try {
      body = await readFile(paths.resultPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const parsed = JSON.parse(body) as ExecutionResultMarker;
    const commonValid = (
      (parsed?.version === 1 || parsed?.version === 2)
      && parsed.runId === runId
      && parsed.nodeId === nodeId
      && parsed.attemptNo === attemptNo
      && typeof parsed.attemptId === 'string'
      && ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(parsed.state)
    );
    const v2Valid = parsed?.version !== 2 || (
      ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(parsed.processState)
      && (parsed.evidenceState === 'verified' || parsed.evidenceState === 'failed')
      && Boolean(parsed.evidence && typeof parsed.evidence === 'object' && Array.isArray(parsed.evidence.artifacts))
    );
    const provenance = parsed?.provenance;
    const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const writesValid = !provenance || (provenance.writeManifest === undefined && provenance.writeManifestHash === undefined)
      || (Array.isArray(provenance.writeManifest) && hash(provenance.writeManifestHash)
        && provenance.writeManifest.every(entry => entry && typeof entry.path === 'string'
          && ['file', 'directory', 'missing'].includes(entry.kind) && (entry.kind !== 'file' || hash(entry.sha256)))
        && executionIdentityHash(provenance.writeManifest) === provenance.writeManifestHash);
    const provenanceValid = !provenance || (provenance.version === 1
      && provenance.runId === runId && provenance.nodeId === nodeId && provenance.attemptNo === attemptNo && provenance.attemptId === parsed.attemptId
      && hash(provenance.nodeSpecHash) && hash(provenance.inputManifestHash) && hash(provenance.outputManifestHash) && hash(provenance.toolchainHash)
      && Array.isArray(provenance.inputPaths) && provenance.inputPaths.every((item) => typeof item === 'string')
      && Array.isArray(provenance.inputManifest) && Array.isArray(provenance.outputManifest) && Array.isArray(provenance.dependencies)
      && typeof provenance.sourceBound === 'boolean' && typeof provenance.inputsStableDuringAttempt === 'boolean');
    if (!commonValid || !v2Valid || !provenanceValid || !writesValid) {
      fail('EXECUTION_RESULT_INVALID', 'Execution result marker does not match the requested attempt');
    }
    return parsed;
  }

  async writeResultAtomic(marker: ExecutionResultMarker): Promise<string> {
    const paths = this.paths(marker.runId, marker.nodeId, marker.attemptNo);
    segment(marker.attemptId, 'attemptId');
    if (marker.version !== 1 && marker.version !== 2) fail('EXECUTION_RESULT_INVALID', 'Unsupported execution result version');
    if (await exists(paths.resultPath)) fail('EXECUTION_RESULT_EXISTS', 'Terminal execution result already exists');
    await mkdir(paths.directory, { recursive: true });
    const tempPath = `${paths.resultPath}.tmp-${process.pid}-${randomUUID()}`;
    const payload = `${JSON.stringify(marker, null, 2)}\n`;
    const handle = await open(tempPath, 'wx');
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      if (await exists(paths.resultPath)) fail('EXECUTION_RESULT_EXISTS', 'Terminal execution result already exists');
      await rename(tempPath, paths.resultPath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return paths.resultPath;
  }
}
