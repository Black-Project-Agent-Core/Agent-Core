import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecutionResultMarker } from '../src/execution/log-store.js';
import type { ParsedExecutionOutput } from '../src/execution/output-parser.js';
import { ExecutionStore } from '../src/execution/store.js';

const roots: string[] = [];
const stores: ExecutionStore[] = [];
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stdout = 'Tests  2 passed (2)\n';
const stderr = '';

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(terminal = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-parsed-store-'));
  roots.push(root);
  const stateRoot = path.join(root, 'state');
  const store = new ExecutionStore(); stores.push(store);
  await store.open({ stateRoot });
  const scope = { principalId: 'principal-output', projectId: root };
  const planHash = sha('accepted plan');
  const run = await store.createRun(scope, { objective: 'derive bounded output from terminal evidence', maxConcurrency: 1,
    metadata: { workflowBinding: { planHash, planRevision: '1' } } });
  await store.persistGraph(scope, run.runId, [{ id: 'verify', purpose: 'verify', command: 'fixture-command', cwd: root,
    dependsOn: [], timeoutMs: 5000, expectedArtifacts: [] }]);
  await store.createAttempt(scope, run.runId, 'verify', 'attempt-output-1', 1, {
    directory: root, stdoutPath: 'stdout.log', stderrPath: 'stderr.log', resultPath: 'result.json',
  });
  const marker: ExecutionResultMarker = {
    version: 1, runId: run.runId, nodeId: 'verify', attemptId: 'attempt-output-1', attemptNo: 1,
    state: 'succeeded', exitCode: 0, signal: null, startedAt: 1, finishedAt: 2,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: 0, stdoutSha256: sha(stdout), stderrSha256: sha(stderr),
    provenance: { version: 1, runId: run.runId, nodeId: 'verify', attemptId: 'attempt-output-1', attemptNo: 1,
      nodeSpecHash: sha('node'), inputPaths: [], inputManifest: [], inputManifestHash: sha('[]'),
      outputManifest: [], outputManifestHash: sha('[]'), toolchainHash: sha('toolchain'), sourceBound: true,
      inputsStableDuringAttempt: true, dependencies: [], workflowBinding: { planHash, planRevision: '1' } },
  };
  if (terminal) await store.completeAttempt(scope, marker);
  const parsed: ParsedExecutionOutput = {
    version: 1, parserVersion: '2.0.0', nodeId: marker.nodeId, attemptNo: marker.attemptNo,
    exitCode: marker.exitCode, source: { stdoutSha256: marker.stdoutSha256, stderrSha256: marker.stderrSha256 },
    raw: { stdoutBytes: marker.stdoutBytes, stderrBytes: marker.stderrBytes },
    structured: { testResults: { passed: 2, failed: 0, skipped: 0 } }, confidence: 0.95,
    binding: { runId: marker.runId, attemptId: marker.attemptId, planHash, planRevision: '1' },
    rawAccess: { tool: 'execution_logs', runId: marker.runId, nodeId: marker.nodeId,
      attemptId: marker.attemptId, attemptNo: marker.attemptNo, requiresRouteContext: true },
    coverage: { version: 1, state: 'complete', integrity: 'verified', streams: {
      stdout: { strategy: 'full', totalBytes: marker.stdoutBytes, examinedBytes: marker.stdoutBytes, omittedBytes: 0,
        ranges: [{ start: 0, end: marker.stdoutBytes }] },
      stderr: { strategy: 'full', totalBytes: 0, examinedBytes: 0, omittedBytes: 0, ranges: [] },
    } },
  };
  const attemptPath = path.join(stateRoot, 'state', 'runs', run.runId, 'attempts', marker.nodeId, '001.json');
  return { root, stateRoot, store, scope, run, marker, parsed, attemptPath };
}

describe('attempt-bound additive parsed output persistence', () => {
  it('rejects forged source hashes, byte counts, process outcome and parsed identity without writing', async () => {
    const f = await fixture(); const before = await readFile(f.attemptPath, 'utf8');
    const variants: ParsedExecutionOutput[] = [
      { ...f.parsed, source: { ...f.parsed.source, stdoutSha256: sha('unrelated output') } },
      { ...f.parsed, raw: { ...f.parsed.raw, stdoutBytes: f.marker.stdoutBytes + 1 } },
      { ...f.parsed, exitCode: 8 },
    ];
    for (const parsed of variants) await expect(f.store.persistParsedOutput(f.scope, f.marker, parsed))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH' });
    await expect(f.store.persistParsedOutput(f.scope, f.marker, { ...f.parsed, nodeId: 'other' }))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH' });
    expect(await readFile(f.attemptPath, 'utf8')).toBe(before);
  });

  it('rejects wrong attempt, plan and raw-access bindings and enforces principal/project ownership', async () => {
    const f = await fixture();
    for (const binding of [
      { ...f.parsed.binding!, runId: 'wrong-run' }, { ...f.parsed.binding!, attemptId: 'wrong-attempt' },
      { ...f.parsed.binding!, planHash: sha('other plan') }, { ...f.parsed.binding!, planRevision: '2' },
    ]) await expect(f.store.persistParsedOutput(f.scope, f.marker, { ...f.parsed, binding }))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH' });
    await expect(f.store.persistParsedOutput(f.scope, f.marker, { ...f.parsed,
      rawAccess: { ...f.parsed.rawAccess!, attemptNo: 2 } })).rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH' });
    await expect(f.store.persistParsedOutput({ ...f.scope, principalId: 'another' }, f.marker, f.parsed))
      .rejects.toMatchObject({ code: 'EXECUTION_RUN_NOT_FOUND' });
    await expect(f.store.getParsedOutput({ ...f.scope, projectId: path.join(f.root, 'another') }, f.run.runId, 'verify', 1))
      .rejects.toMatchObject({ code: 'EXECUTION_RUN_NOT_FOUND' });
  });

  it('requires matching persisted terminal truth even when supplied marker and parser agree with each other', async () => {
    const f = await fixture(false);
    await expect(f.store.persistParsedOutput(f.scope, f.marker, f.parsed))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH' });
    await f.store.completeAttempt(f.scope, f.marker);
    const fakeHash = sha('fabricated terminal log');
    await expect(f.store.persistParsedOutput(f.scope, { ...f.marker, stdoutSha256: fakeHash },
      { ...f.parsed, source: { ...f.parsed.source, stdoutSha256: fakeHash } }))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH' });
    await expect(f.store.persistParsedOutputFailure(f.scope, { ...f.marker, attemptId: 'other-attempt' }, '2.0.0', 'PARSE_FAILED'))
      .rejects.toMatchObject({ code: 'EXECUTION_ATTEMPT_NOT_FOUND' });
    expect(await f.store.getParsedOutput(f.scope, f.run.runId, 'verify', 1)).toBeNull();
  });

  it('recovers a degraded parser version by appending success and makes subsequent persistence idempotent', async () => {
    const f = await fixture();
    await f.store.persistParsedOutputFailure(f.scope, f.marker, '2.0.0', 'TRANSIENT_READ_FAILURE');
    await f.store.persistParsedOutputFailure(f.scope, f.marker, '2.0.0', 'TRANSIENT_READ_FAILURE');
    await f.store.persistParsedOutput(f.scope, f.marker, f.parsed);
    const successful = await readFile(f.attemptPath, 'utf8');
    await f.store.persistParsedOutput(f.scope, f.marker, structuredClone(f.parsed));
    await f.store.persistParsedOutputFailure(f.scope, f.marker, '2.0.0', 'LATER_OBSERVER_FAILURE');
    expect(await readFile(f.attemptPath, 'utf8')).toBe(successful);
    const records = JSON.parse(successful).parsedOutputs;
    expect(records.map((record: { status: string }) => record.status)).toEqual(['degraded', 'available']);
    expect(records[0].failureCode).toBe('TRANSIENT_READ_FAILURE');
    expect(await f.store.getParsedOutput(f.scope, f.run.runId, 'verify', 1)).toMatchObject({
      available: true, coverageStatus: 'complete', coverage: f.parsed.coverage,
      binding: f.parsed.binding, rawAccess: f.parsed.rawAccess,
    });
    await expect(f.store.persistParsedOutput(f.scope, f.marker,
      { ...f.parsed, structured: { testResults: { passed: 3, failed: 0, skipped: 0 } } }))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_CONFLICT' });
    expect(await readFile(f.attemptPath, 'utf8')).toBe(successful);
  });

  it('supports partial coverage but rejects falsely complete, overlapping and mismatched ranges', async () => {
    const f = await fixture();
    const coverage = structuredClone(f.parsed.coverage!);
    coverage.state = 'partial';
    coverage.streams.stdout = { strategy: 'head_tail', totalBytes: f.marker.stdoutBytes,
      examinedBytes: 4, omittedBytes: f.marker.stdoutBytes - 4,
      ranges: [{ start: 0, end: 2 }, { start: f.marker.stdoutBytes - 2, end: f.marker.stdoutBytes }] };
    await expect(f.store.persistParsedOutput(f.scope, f.marker, { ...f.parsed, coverage: { ...coverage, state: 'complete' } }))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID' });
    const overlap = structuredClone(coverage); overlap.streams.stdout.ranges = [{ start: 0, end: 3 }, { start: 2, end: 3 }];
    await expect(f.store.persistParsedOutput(f.scope, f.marker, { ...f.parsed, coverage: overlap }))
      .rejects.toMatchObject({ code: 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID' });
    await f.store.persistParsedOutput(f.scope, f.marker, { ...f.parsed, coverage });
    expect(await f.store.getParsedOutput(f.scope, f.run.runId, 'verify', 1))
      .toMatchObject({ available: true, coverageStatus: 'partial', coverage });
  });

  it('returns degraded metadata for tampered stored sources and binding without rewriting the historical bytes', async () => {
    const f = await fixture(); await f.store.persistParsedOutput(f.scope, f.marker, f.parsed);
    const valid = JSON.parse(await readFile(f.attemptPath, 'utf8'));
    const mutations = [
      (record: any) => { record.parsedOutputs[0].parsed.source.stdoutSha256 = sha('bad'); },
      (record: any) => { record.parsedOutputs[0].parsed.binding.attemptId = 'another'; },
      (record: any) => { record.parsedOutputs[0].parsed.binding.planHash = sha('another plan'); },
      (record: any) => { delete record.parsedOutputs[0].parsed.source; },
      (record: any) => { record.parsedOutputs[0].parsed.parserVersion = 'forged'; },
      (record: any) => { record.nodeId = 'different-node'; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(valid); mutate(changed);
      const serialized = JSON.stringify(changed); await writeFile(f.attemptPath, serialized);
      expect(await f.store.getParsedOutput(f.scope, f.run.runId, 'verify', 1))
        .toMatchObject({ available: false, status: 'degraded', failureCode: expect.stringMatching(/^EXECUTION_PARSED_OUTPUT_/) });
      expect(await readFile(f.attemptPath, 'utf8')).toBe(serialized);
    }
  });

  it('reads and reopens legacy records with explicit unknown coverage in the view only', async () => {
    const f = await fixture();
    const { binding: _binding, coverage: _coverage, projection: _projection, rawAccess: _rawAccess, ...legacy } = f.parsed;
    await f.store.persistParsedOutput(f.scope, f.marker, { ...legacy, parserVersion: '1.0.0' });
    const historical = JSON.parse(await readFile(f.attemptPath, 'utf8'));
    delete historical.parsedOutputs[0].markerBinding;
    const serialized = JSON.stringify(historical); await writeFile(f.attemptPath, serialized);
    await f.store.close(); stores.splice(stores.indexOf(f.store), 1);
    const reopened = new ExecutionStore(); stores.push(reopened); await reopened.open({ stateRoot: f.stateRoot });
    const view = await reopened.getParsedOutput(f.scope, f.run.runId, 'verify', 1);
    expect(view).toMatchObject({ available: true, parserVersion: '1.0.0', coverageStatus: 'legacy_unknown', structured: legacy.structured });
    expect(view).not.toHaveProperty('coverage'); expect(view).not.toHaveProperty('binding');
    expect(await readFile(f.attemptPath, 'utf8')).toBe(serialized);
    expect(sha(await readFile(f.attemptPath, 'utf8'))).toBe(sha(serialized));
  });

  it('appends a repaired same-version observation after invalid available metadata and keeps repair idempotent', async () => {
    const f = await fixture(); await f.store.persistParsedOutput(f.scope, f.marker, f.parsed);
    const valid = JSON.parse(await readFile(f.attemptPath, 'utf8'));
    const corruptions = [
      (record: any) => { record.sourceStdoutSha256 = sha('wrong source'); },
      (record: any) => { record.parsed.binding.planHash = sha('wrong plan'); },
      (record: any) => { record.markerBinding.attemptId = 'wrong attempt'; },
      (record: any) => { delete record.parsed; },
      (record: any) => { record.sourceStdoutSha256 = sha('wrong source'); record.createdAt = Number.MAX_SAFE_INTEGER; },
    ];
    for (const corrupt of corruptions) {
      const state = structuredClone(valid); corrupt(state.parsedOutputs[0]);
      const invalid = structuredClone(state.parsedOutputs[0]);
      await writeFile(f.attemptPath, JSON.stringify(state));
      expect(await f.store.getParsedOutput(f.scope, f.run.runId, 'verify', 1)).toMatchObject({ available: false, status: 'degraded' });
      await f.store.persistParsedOutput(f.scope, f.marker, f.parsed);
      expect(await f.store.getParsedOutput(f.scope, f.run.runId, 'verify', 1))
        .toMatchObject({ available: true, parserVersion: '2.0.0', binding: f.parsed.binding, coverageStatus: 'complete' });
      const repaired = await readFile(f.attemptPath, 'utf8');
      const records = JSON.parse(repaired).parsedOutputs;
      expect(records).toHaveLength(2); expect(records[0]).toEqual(invalid);
      await f.store.persistParsedOutput(f.scope, f.marker, structuredClone(f.parsed));
      expect(await readFile(f.attemptPath, 'utf8')).toBe(repaired);
    }
  });
});
