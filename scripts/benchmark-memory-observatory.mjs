import { spawn } from 'node:child_process';
import { appendFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../dist/config.js';
import { MemoryService } from '../dist/memory/service.js';
import { AuditJournal, verifyAuditJournal } from '../dist/observability/audit-journal.js';
import { AuditRecordBroadcaster } from '../dist/observability/audit-stream.js';

const DEFAULT_COUNT = 100_000;
const DEFAULT_SAMPLES = 15;
const DEFAULT_WARMUP = 3;
const DEFAULT_BURST_EVENTS = 10_000;
const GRAPH_NODES = 500;
const GRAPH_EDGES = 2_000;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBSERVATORY_DIR = path.join(ROOT_DIR, 'SubProject', 'Memory-Observatory');
const BENCHMARK_SCOPE = { principalId: 'benchmark-principal', projectId: 'benchmark-project' };

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1))] ?? 0;
}

function summarize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    samples: values.length,
    minMs: Number(Math.min(...values).toFixed(3)),
    meanMs: Number((total / Math.max(1, values.length)).toFixed(3)),
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

async function measure(operation, samples, warmup) {
  for (let index = 0; index < warmup; index += 1) await operation(index, true);
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await operation(index, false);
    values.push(performance.now() - started);
  }
  return summarize(values);
}

function relativeRegression(baseline, observed) {
  if (!(baseline > 0)) return Number.POSITIVE_INFINITY;
  return (observed - baseline) / baseline;
}

export function evaluateObservatoryGates(input) {
  const maxInstrumentedP95 = Math.max(input.instrumentedPreflightP95Ms, input.subscriberPreflightP95Ms);
  const overhead = relativeRegression(input.baselinePreflightP95Ms, maxInstrumentedP95);
  const checks = {
    existingPreflight: input.existingPreflightP95Ms < 150,
    baselinePreflight: input.baselinePreflightP95Ms < 150,
    instrumentationOverhead: overhead <= 0.10,
    activityLatency: input.persistedToSubscriberP95Ms < 250,
    graphConvergence: input.browserConvergenceP95Ms < 500,
    sequenceDuplication: input.duplicateSequences === 0,
    sequenceGaps: input.undetectedSequenceGaps === 0,
    observerIsolation: input.observerCausedMutationFailures === 0,
    auditWriteOrder: input.auditWriteOrderRegressions === 0,
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    instrumentationRelativeP95Regression: Number(overhead.toFixed(6)),
    instrumentationRelativeP95RegressionPercent: Number((overhead * 100).toFixed(3)),
  };
}

function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    samples: DEFAULT_SAMPLES,
    warmup: DEFAULT_WARMUP,
    burstEvents: DEFAULT_BURST_EVENTS,
    browser: true,
  };
  for (const arg of argv) {
    if (arg.startsWith('--count=')) options.count = Number(arg.slice('--count='.length));
    else if (arg.startsWith('--samples=')) options.samples = Number(arg.slice('--samples='.length));
    else if (arg.startsWith('--warmup=')) options.warmup = Number(arg.slice('--warmup='.length));
    else if (arg.startsWith('--burst-events=')) options.burstEvents = Number(arg.slice('--burst-events='.length));
    else if (arg === '--skip-browser') options.browser = false;
    else throw new Error(`MEMORY_OBSERVATORY_BENCHMARK_ARGUMENT_INVALID:${arg}`);
  }
  if (!Number.isInteger(options.count) || options.count < 1) throw new Error('--count must be a positive integer');
  if (!Number.isInteger(options.samples) || options.samples < 5 || options.samples > 100) throw new Error('--samples must be 5..100');
  if (!Number.isInteger(options.warmup) || options.warmup < 0 || options.warmup > 25) throw new Error('--warmup must be 0..25');
  if (!Number.isInteger(options.burstEvents) || options.burstEvents < 100 || options.burstEvents > 50_000) throw new Error('--burst-events must be 100..50000');
  return options;
}

async function runCommand(command, args, cwd = ROOT_DIR, env = process.env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        reject(Object.assign(new Error(`COMMAND_FAILED:${command}:${code ?? signal}\n${stderr.slice(-8000)}`), { stdout, stderr, code, signal }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function journalSink(journal) {
  return {
    emit(event) {
      const { type, timestamp, ...data } = event;
      journal.enqueue({ category: 'memory', event: type, timestamp, data });
    },
  };
}

async function benchmarkPreflightMode({ dbPath, root, samples, warmup, sink, after }) {
  const config = {
    ...loadConfig({ AGENT_CORE_MEMORY_DB_PATH: dbPath, AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false' }, root).memory,
    enabled: true,
    dbPath,
  };
  const service = new MemoryService(config, undefined, sink ? { activitySink: sink } : {});
  let failures = 0;
  try {
    await service.status(BENCHMARK_SCOPE);
    const timing = await measure(async (index, warming) => {
      try {
        await service.preflight({
          scope: BENCHMARK_SCOPE,
          routeContextId: randomUUID(),
          task: 'benchmark.hot',
          context: warming ? 'warmup' : `observatory-mode-${index}`,
          expiresAt: Date.now() + 300_000 + index,
        });
      } catch (error) {
        failures += 1;
        throw error;
      }
    }, samples, warmup);
    if (after) await after();
    return { timing, failures };
  } finally {
    await service.close().catch(() => undefined);
  }
}

function createMeasuredJournal(logRoot, { withSubscriber = false, queueCapacity = 4096 } = {}) {
  const broadcaster = withSubscriber ? new AuditRecordBroadcaster() : undefined;
  const persistedAt = new Map();
  const deliveryLatencies = [];
  const sequences = [];
  const appendLine = async (filePath, line) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, line, 'utf8');
    try {
      const record = JSON.parse(line);
      if (Number.isSafeInteger(record.sequence)) persistedAt.set(record.sequence, performance.now());
    } catch {}
  };
  const journal = new AuditJournal(logRoot, { queueCapacity, broadcaster, appendLine });
  const subscription = broadcaster?.subscribe((record) => {
    const persisted = persistedAt.get(record.sequence);
    if (persisted !== undefined) deliveryLatencies.push(Math.max(0, performance.now() - persisted));
    sequences.push(record.sequence);
  });
  return { journal, broadcaster, subscription, deliveryLatencies, sequences };
}

async function benchmarkObserverMutationIsolation(root) {
  const dbPath = path.join(root, 'observer-isolation.sqlite');
  const config = {
    ...loadConfig({ AGENT_CORE_MEMORY_DB_PATH: dbPath, AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false' }, root).memory,
    enabled: true,
    dbPath,
  };
  const service = new MemoryService(config, undefined, { activitySink: { emit() { throw new Error('BENCHMARK_OBSERVER_FAILURE'); } } });
  let failures = 0;
  try {
    for (let index = 0; index < 20; index += 1) {
      try {
        await service.commit({
          scope: { principalId: 'observer-isolation-principal', projectId: 'observer-isolation-project' },
          canonicalKey: `benchmark.observer-isolation.${index}`,
          kind: 'observation',
          value: `Observer isolation benchmark memory ${index}.`,
          sourceType: 'benchmark',
        });
      } catch {
        failures += 1;
      }
    }
    return { operations: 20, failures };
  } finally {
    await service.close().catch(() => undefined);
  }
}

async function benchmarkAuditBurst(root, count) {
  const measured = createMeasuredJournal(path.join(root, 'audit-burst'), { withSubscriber: true, queueCapacity: Math.min(65_536, count + 256) });
  try {
    let rejected = 0;
    for (let index = 0; index < count; index += 1) {
      if (!measured.journal.enqueue({ category: 'memory', event: 'memory.benchmark_burst', data: { index } })) rejected += 1;
    }
    await measured.journal.drain();
    await measured.broadcaster.drain();
    const status = measured.journal.status();
    const unique = new Set(measured.sequences);
    let gaps = 0;
    for (let index = 1; index < measured.sequences.length; index += 1) {
      if (measured.sequences[index] !== measured.sequences[index - 1] + 1) gaps += 1;
    }
    const verification = await verifyAuditJournal(measured.journal.auditRoot);
    return {
      requested: count,
      rejected,
      written: status.written,
      dropped: status.dropped,
      writeErrors: status.writeErrors,
      delivered: measured.sequences.length,
      duplicateSequences: measured.sequences.length - unique.size,
      undetectedSequenceGaps: gaps,
      persistedToSubscriber: summarize(measured.deliveryLatencies),
      auditWriteOrderRegressions: verification.ok ? 0 : 1,
      auditVerification: verification.ok ? 'PASS' : verification.code,
    };
  } finally {
    measured.subscription?.close();
    await measured.journal.close().catch(() => undefined);
  }
}

function syntheticGraphSnapshot() {
  const nodes = Array.from({ length: GRAPH_NODES }, (_, index) => ({
    memoryId: `node-${index}`,
    title: `Benchmark Node ${index}`,
    canonicalKey: `benchmark.node.${index}`,
    kind: 'observation',
    state: 'active',
    revisionNo: 1,
    valuePreview: `Bounded benchmark preview ${index}.`,
    importance: 0.5,
    pinned: false,
    createdAt: index,
    updatedAt: index,
  }));
  const edges = Array.from({ length: GRAPH_EDGES }, (_, index) => {
    const from = index % GRAPH_NODES;
    const to = (from + 1 + Math.floor(index / GRAPH_NODES)) % GRAPH_NODES;
    return {
      edgeId: `edge-${index}`,
      fromMemoryId: `node-${from}`,
      toMemoryId: `node-${to}`,
      relation: index % 2 === 0 ? 'continues' : 'depends_on',
      weight: 1,
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    auditSequence: 0,
    project: { projectId: 'benchmark-project', workspaceLabel: 'benchmark-project' },
    status: { memoryHealthy: true, lifecycleMode: 'advisory', remoteEnabled: false, remoteDurabilityState: 'NOT_CONFIGURED' },
    nodes,
    edges,
    conflicts: [],
    timeline: [],
    continuity: { active: [], completed: [], blocked: [], deferred: [], unfinished: [], frontier: [], interruptedTurnIds: [] },
    truncated: { nodes: false, edges: false, timeline: false },
  };
}

async function benchmarkSnapshotSerialization(samples, warmup) {
  const snapshot = syntheticGraphSnapshot();
  let lastBytes = 0;
  const timing = await measure(async () => {
    lastBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  }, samples, warmup);
  return { nodes: snapshot.nodes.length, edges: snapshot.edges.length, bytes: lastBytes, timing };
}

async function benchmarkBrowserConvergence() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], OBSERVATORY_DIR);
  const run = await runCommand(npx, ['playwright', 'test', 'tests/live-memory.spec.ts', '--reporter=line'], OBSERVATORY_DIR);
  const output = `${run.stdout}\n${run.stderr}`;
  const match = /TASK10_BROWSER_CONVERGENCE_P95_MS=([0-9.]+)/.exec(output);
  if (!match) throw new Error(`BROWSER_CONVERGENCE_METRIC_MISSING:${output.slice(-4000)}`);
  return { p95Ms: Number(match[1]), test: 'SubProject/Memory-Observatory/tests/live-memory.spec.ts' };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtureSamples = Math.max(5, Math.min(options.samples, 15));
  process.stderr.write(`[memory-observatory-benchmark] preparing ${options.count.toLocaleString('en-US')} memory fixture\n`);
  const seed = await runCommand(process.execPath, [
    path.join(ROOT_DIR, 'scripts', 'benchmark-memory.mjs'),
    `--count=${options.count}`,
    `--samples=${fixtureSamples}`,
    `--warmup=${Math.min(options.warmup, 5)}`,
    '--target-p95-ms=150',
    '--keep',
  ]);
  const seedReport = JSON.parse(seed.stdout);
  const seeded = seedReport.results?.[0];
  if (!seeded?.root) throw new Error('MEMORY_OBSERVATORY_BENCHMARK_FIXTURE_ROOT_MISSING');
  const root = seeded.root;
  const dbPath = path.join(root, 'memory.sqlite');
  process.stderr.write(`[memory-observatory-benchmark] existing ${Number(seeded.count).toLocaleString('en-US')} p95=${seeded.preflight.p95Ms}ms\n`);

  try {
    const baseline = await benchmarkPreflightMode({ dbPath, root, samples: options.samples, warmup: options.warmup });

    const instrumentedJournal = createMeasuredJournal(path.join(root, 'observatory-instrumented'));
    const instrumented = await benchmarkPreflightMode({
      dbPath,
      root,
      samples: options.samples,
      warmup: options.warmup,
      sink: journalSink(instrumentedJournal.journal),
      after: async () => { await instrumentedJournal.journal.drain(); },
    });
    const instrumentedStatus = instrumentedJournal.journal.status();
    await instrumentedJournal.journal.close();

    const subscriberJournal = createMeasuredJournal(path.join(root, 'observatory-subscriber'), { withSubscriber: true });
    const subscriber = await benchmarkPreflightMode({
      dbPath,
      root,
      samples: options.samples,
      warmup: options.warmup,
      sink: journalSink(subscriberJournal.journal),
      after: async () => {
        await subscriberJournal.journal.drain();
        await subscriberJournal.broadcaster.drain();
      },
    });
    const subscriberStatus = subscriberJournal.journal.status();
    subscriberJournal.subscription?.close();
    await subscriberJournal.journal.close();

    const burst = await benchmarkAuditBurst(root, options.burstEvents);
    const snapshot = await benchmarkSnapshotSerialization(options.samples, options.warmup);
    const mutationIsolation = await benchmarkObserverMutationIsolation(root);
    const browser = options.browser ? await benchmarkBrowserConvergence() : { p95Ms: 0, skipped: true };

    const persistedLatency = Math.max(
      subscriberJournal.deliveryLatencies.length ? summarize(subscriberJournal.deliveryLatencies).p95Ms : 0,
      burst.persistedToSubscriber.p95Ms,
    );
    const gateInput = {
      existingPreflightP95Ms: seeded.preflight.p95Ms,
      baselinePreflightP95Ms: baseline.timing.p95Ms,
      instrumentedPreflightP95Ms: instrumented.timing.p95Ms,
      subscriberPreflightP95Ms: subscriber.timing.p95Ms,
      persistedToSubscriberP95Ms: persistedLatency,
      browserConvergenceP95Ms: options.browser ? browser.p95Ms : 0,
      duplicateSequences: burst.duplicateSequences,
      undetectedSequenceGaps: burst.undetectedSequenceGaps,
      observerCausedMutationFailures: mutationIsolation.failures,
      auditWriteOrderRegressions: burst.auditWriteOrderRegressions,
    };
    const gates = evaluateObservatoryGates(gateInput);
    if (!options.browser) gates.checks.graphConvergence = true;
    gates.passed = Object.values(gates.checks).every(Boolean);

    const report = {
      benchmark: 'agent-core-memory-observatory',
      startedAt: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      options,
      matrix: {
        A_observatoryDisabled: baseline,
        B_instrumentationNoSubscriber: { ...instrumented, audit: instrumentedStatus },
        C_oneSubscriber: { ...subscriber, audit: subscriberStatus, persistedToSubscriber: summarize(subscriberJournal.deliveryLatencies) },
        D_auditActivityBurst: burst,
        E_graphSnapshotSerialization: snapshot,
        F_browserConvergence: browser,
      },
      existingMemoryBenchmark: {
        count: seeded.count,
        activeItems: seeded.activeItems,
        preflight: seeded.preflight,
        targetPassed: seeded.targetPassed,
      },
      observerMutationIsolation: mutationIsolation,
      gateInput,
      gates,
      finishedAt: new Date().toISOString(),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!gates.passed) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
