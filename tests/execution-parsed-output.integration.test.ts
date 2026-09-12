import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ExecutionService } from '../src/execution/service.js';
import { ExecutionStore } from '../src/execution/store.js';
import { ExecutionLogStore } from '../src/execution/log-store.js';
import { EXECUTION_OUTPUT_PARSER_VERSION, ExecutionOutputParserService } from '../src/execution/output-parser.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { nodeShellCommand } from './helpers/platform-command.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(label: string, outputParserOverride?: any) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-parsed-output-${label}-`));
  roots.push(root);
  const base = loadConfig({}, root).execution;
  const config = {
    ...base,
    enabled: true,
    logRoot: path.join(root, 'runtime', 'runs'),
  };
  const workspace = new WorkspacePolicy([root]);
  const metrics = new RuntimeMetricRegistry();
  const store = new ExecutionStore();
  const parser = outputParserOverride ?? new ExecutionOutputParserService(store, new ExecutionLogStore(config.logRoot), metrics);
  const service = new ExecutionService(config, workspace, { store, outputParser: parser, metrics });
  await service.open();
  return { root, config, workspace, metrics, service, scope: { principalId: 'parsed-principal', projectId: root } };
}

describe('persisted structured execution output', () => {
  it('persists bounded parsed evidence before terminal wake, exposes it in status, and survives restart', async () => {
    const f = await fixture('persist');
    const secret = 'SENTINEL_PARSED_OUTPUT_SECRET_123456';
    const created = await f.service.create(f.scope, {
      objective: 'parse test output',
      nodes: [{
        id: 'A', purpose: 'emit deterministic test summary',
        command: nodeShellCommand(`
          process.stdout.write('Test Files  1 passed (1)\\nTests  7 passed | 2 skipped (9)\\n');
          process.stderr.write('error: token=${secret} fixture failure sample\\n');
        `),
        cwd: f.root,
      }],
    });
    await f.service.start(f.scope, created.runId);
    const done = await f.service.wait(f.scope, created.runId, created.lastEventSequence, { eventTypes: ['run.completed'] }, 5_000);
    expect(done.event?.eventType).toBe('run.completed');
    const nodeEvidence = done.state.evidence.nodes[0] as any;
    expect(nodeEvidence.parsedOutput).toMatchObject({
      available: true,
      parserVersion: EXECUTION_OUTPUT_PARSER_VERSION,
      confidence: 0.95,
      structured: {
        testResults: { passed: 7, failed: 0, skipped: 2 },
        errorPatterns: [expect.objectContaining({ type: 'generic', count: 1 })],
      },
    });
    expect(JSON.stringify(done.state)).not.toContain(secret);
    expect(f.metrics.metric('execution.output_parse.duration_ms').count).toBe(1);
    const runId = created.runId;
    await f.service.close();

    const reopenedStore = new ExecutionStore();
    const reopenedMetrics = new RuntimeMetricRegistry();
    const reopened = new ExecutionService(f.config, f.workspace, {
      store: reopenedStore,
      outputParser: new ExecutionOutputParserService(reopenedStore, new ExecutionLogStore(f.config.logRoot), reopenedMetrics),
      metrics: reopenedMetrics,
    });
    await reopened.open();
    try {
      const status = await reopened.status(f.scope, runId);
      expect((status?.evidence.nodes[0] as any)?.parsedOutput).toEqual(nodeEvidence.parsedOutput);
      expect(JSON.stringify(status)).not.toContain(secret);
    } finally {
      await reopened.close();
    }
  }, 10_000);

  it('fails open when the parser observer throws and preserves factual process success', async () => {
    const f = await fixture('fail-open', { parseAttempt: async () => { throw new Error('synthetic parser failure'); } });
    try {
      const created = await f.service.create(f.scope, {
        objective: 'parser failure cannot block process truth',
        nodes: [{ id: 'A', purpose: 'A', command: nodeShellCommand(`process.stdout.write('ok')`), cwd: f.root }],
      });
      await f.service.start(f.scope, created.runId);
      const done = await f.service.wait(f.scope, created.runId, created.lastEventSequence, { eventTypes: ['run.completed'] }, 5_000);
      expect(done.state.state).toBe('completed');
      expect(done.state.evidence.nodes[0]).toMatchObject({ processState: 'succeeded', evidenceState: 'not_declared' });
      expect((done.state.evidence.nodes[0] as any).parsedOutput).toMatchObject({ available: false, status: 'degraded' });
    } finally {
      await f.service.close();
    }
  }, 10_000);

  it.each(['degraded', 'missing'] as const)('recovers a %s observation after restart from the same raw attempt without rerunning the process', async (mode) => {
    const f = await fixture(`recover-${mode}`, { parserVersion: EXECUTION_OUTPUT_PARSER_VERSION,
      parseAttempt: async () => { if (mode === 'degraded') throw new Error('interrupted observation'); } });
    const created = await f.service.create(f.scope, {
      objective: 'recover only the output view',
      nodes: [{ id: 'A', purpose: 'single process invocation', cwd: f.root,
        command: nodeShellCommand(`const fs=require('node:fs'); fs.appendFileSync('invocations.txt','once\\n'); process.stdout.write('Tests  3 passed (3)\\n');`) }],
    });
    await f.service.start(f.scope, created.runId);
    const done = await f.service.wait(f.scope, created.runId, created.lastEventSequence, { eventTypes: ['run.completed'] }, 10_000);
    expect(done.state.evidence.nodes[0]?.parsedOutput).toMatchObject({ available: false,
      status: mode === 'degraded' ? 'degraded' : 'unavailable', rawAccess: { tool: 'execution_logs' } });
    const before = await f.service.store.listAttempts(f.scope, created.runId);
    const markerBefore = await readFile(f.service.logs.paths(created.runId, 'A', 1).resultPath);
    await f.service.close();
    const reopened = new ExecutionService(f.config, f.workspace);
    await reopened.open();
    try {
      const status = await reopened.status(f.scope, created.runId);
      expect(status?.evidence.nodes[0]?.parsedOutput).toMatchObject({ available: true,
        coverageStatus: 'complete', binding: { runId: created.runId, attemptId: before[0]!.attemptId },
        structured: { testResults: { passed: 3, failed: 0, skipped: 0 } } });
      expect(await readFile(path.join(f.root, 'invocations.txt'), 'utf8')).toBe('once\n');
      expect(await reopened.store.listAttempts(f.scope, created.runId)).toEqual(before);
      expect(await readFile(reopened.logs.paths(created.runId, 'A', 1).resultPath)).toEqual(markerBefore);
      expect((await reopened.status(f.scope, created.runId))?.evidence.nodes[0]?.parsedOutput).toEqual(status?.evidence.nodes[0]?.parsedOutput);
    } finally { await reopened.close(); }
  }, 20_000);

  it('keeps overlapping command outputs separate and recovers a late diagnostic through raw pagination', async () => {
    const f = await fixture('independent');
    const command = (name: string) => nodeShellCommand(`
      const fs=require('node:fs');
      fs.writeFileSync('${name}.started','ready');
      const timer=setInterval(()=>{
        if(!fs.existsSync('release.fixture')) return;
        clearInterval(timer);
        process.stdout.write('${name} repeated progress\\n'.repeat(9000));
        process.stdout.write('${name}.ts(7,3): error TS2322: LATE_${name}\\n');
        process.stderr.write('${name} stderr only\\n');
      },20);
    `);
    try {
      const created = await f.service.create(f.scope, {
        objective: 'separate concurrent projection state', maxConcurrency: 2,
        nodes: ['A', 'B'].map(name => ({ id: name, purpose: name, cwd: f.root,
          command: command(name), inputs: [], resources: { reads: ['release.fixture'], writes: [`${name}.started`] } })),
      });
      await f.service.start(f.scope, created.runId);
      // The harness releases both processes only after each has actually started.
      const started = async () => Promise.all(['A', 'B'].map(name => access(path.join(f.root, `${name}.started`)).then(() => true, () => false)));
      const deadline = Date.now() + 10_000;
      while (!(await started()).every(Boolean) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      expect((await started()).every(Boolean)).toBe(true);
      await writeFile(path.join(f.root, 'release.fixture'), 'release');
      const done = await f.service.wait(f.scope, created.runId, created.lastEventSequence, { eventTypes: ['run.completed'] }, 10_000);
      expect(done.state.state).toBe('completed');
      const attempts = await f.service.store.listAttempts(f.scope, created.runId);
      expect(attempts).toHaveLength(2);
      expect(Math.max(...attempts.map(a => a.startedAt))).toBeLessThan(Math.min(...attempts.map(a => a.finishedAt!)));
      for (const name of ['A', 'B']) {
        const parsed = done.state.evidence.nodes.find(node => node.nodeId === name)!.parsedOutput!;
        expect(parsed).toMatchObject({ available: true, coverageStatus: 'partial', coverage: { integrity: 'verified' },
          binding: { runId: created.runId, attemptId: attempts.find(a => a.nodeId === name)!.attemptId },
          rawAccess: { tool: 'execution_logs', nodeId: name, attemptNo: 1 } });
        if (!parsed.available) throw new Error('Projection unavailable');
        expect(JSON.stringify(parsed.projection)).toContain(`LATE_${name}`);
        expect(JSON.stringify(parsed.projection)).not.toContain(`LATE_${name === 'A' ? 'B' : 'A'}`);
        expect(parsed.projection?.quality).toBe('degraded');
        const raw = await readFile(f.service.logs.paths(created.runId, name, 1).stdoutPath);
        expect(createHash('sha256').update(raw).digest('hex')).toBe(parsed.source.stdoutSha256);
        const offset = raw.indexOf(Buffer.from(`${name}.ts`));
        expect(offset).toBeGreaterThan(128 * 1024);
        const detail = await f.service.logs.readLog(created.runId, name, 1, 'stdout', offset, 512);
        expect(detail.data).toContain(`LATE_${name}`);
      }
      expect(await f.service.store.listAttempts(f.scope, created.runId)).toEqual(attempts);
    } finally { await f.service.close(); }
  }, 25_000);

  it('accepts a factual interrupted attempt whose absent stored exit code represents null', async () => {
    const f = await fixture('null-exit');
    try {
      const created = await f.service.create(f.scope, { objective: 'read interrupted output',
        nodes: [{ id: 'A', purpose: 'fixture marker only', cwd: f.root, command: nodeShellCommand('') }] });
      const paths = await f.service.logs.prepareAttempt(created.runId, 'A', 1);
      await f.service.store.createAttempt(f.scope, created.runId, 'A', 'interrupted-fixture-attempt', 1, paths);
      const emptyHash = createHash('sha256').update('').digest('hex');
      const marker = { version: 1 as const, runId: created.runId, nodeId: 'A',
        attemptId: 'interrupted-fixture-attempt', attemptNo: 1, state: 'interrupted' as const,
        startedAt: Date.now() - 1, finishedAt: Date.now(), exitCode: null, signal: null,
        stdoutBytes: 0, stderrBytes: 0, stdoutSha256: emptyHash, stderrSha256: emptyHash };
      await f.service.logs.writeResultAtomic(marker);
      await f.service.store.completeAttempt(f.scope, marker);
      const status = await f.service.status(f.scope, created.runId);
      expect(status?.evidence.nodes[0]).toMatchObject({ processState: 'interrupted', evidenceState: 'not_declared',
        parsedOutput: { available: true, projection: { exitCode: null }, coverageStatus: 'complete' } });
      const attempts = await f.service.store.listAttempts(f.scope, created.runId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.exitCode).toBeUndefined();
    } finally { await f.service.close(); }
  });

  it('rejects a conflicting terminal marker and preserves raw access when a marker is missing', async () => {
    const f = await fixture('marker-binding');
    try {
      const created = await f.service.create(f.scope, { objective: 'bind displayed output to terminal evidence',
        nodes: [{ id: 'A', purpose: 'single attempt', cwd: f.root,
          command: nodeShellCommand(`process.stdout.write('Tests  1 passed (1)\\n');`) }] });
      await f.service.start(f.scope, created.runId);
      const done = await f.service.wait(f.scope, created.runId, created.lastEventSequence, { eventTypes: ['run.completed'] }, 10_000);
      expect(done.state.evidence.nodes[0]?.parsedOutput?.available).toBe(true);
      const resultPath = f.service.logs.paths(created.runId, 'A', 1).resultPath;
      const marker = JSON.parse(await readFile(resultPath, 'utf8'));
      await writeFile(resultPath, JSON.stringify({ ...marker, stdoutSha256: 'f'.repeat(64) }));
      const conflicting = await f.service.status(f.scope, created.runId);
      expect(conflicting?.evidence.nodes[0]).toMatchObject({ processState: 'succeeded', evidenceState: 'failed',
        parsedOutput: { available: false, failureCode: 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH' } });
      await rm(resultPath);
      const missing = await f.service.status(f.scope, created.runId);
      expect(missing?.evidence.nodes[0]).toMatchObject({ evidenceState: 'failed',
        parsedOutput: { rawAccess: { tool: 'execution_logs', runId: created.runId, nodeId: 'A', attemptNo: 1 } } });
      expect((await f.service.store.listAttempts(f.scope, created.runId))).toHaveLength(1);
    } finally { await f.service.close(); }
  }, 20_000);
});
