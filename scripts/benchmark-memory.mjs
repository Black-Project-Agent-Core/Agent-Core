import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { benchmarkMemoryConfig, BenchmarkMemoryTransport, MEMORY_BENCHMARK_SCOPE } from './benchmark-memory-fixture.mjs';
import { GraphifyAdapter } from '../dist/memory/file-native/graphify-adapter.js';
import { fileNativePrincipalNamespace, fileNativeProjectNamespace } from '../dist/memory/file-native/paths.js';
import { DEFAULT_SEGMENT_PRESSURE } from '../dist/memory/file-native/segment-placement.js';
import { serializeVaultSegment } from '../dist/memory/file-native/vault-codec.js';
import { RELATION_WEIGHTS } from '../dist/memory/relation-policy.js';
import { MemoryService } from '../dist/memory/service.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_COUNTS = [10_000, 100_000];
const DEFAULT_SAMPLES = 25;
const DEFAULT_WARMUP = 5;
const DEFAULT_TARGET_P95_MS = 150;
const PRINCIPAL_ID = 'benchmark-principal';
const PROJECT_ID = 'benchmark-project';
const HUB_MEMORY_ID = memoryId(0);
const HOT_KEY = 'benchmark.hot';
const LEXICAL_TERM = 'needlebenchmark';
const RELATION = 'explicit_relation';
const ENTRIES_PER_SEGMENT = DEFAULT_SEGMENT_PRESSURE.softEntryPressure;
const NEEDLE_EVERY = 40;
/**
 * Metrics this benchmark no longer reports, kept in the output so a reader comparing an older run
 * does not read their absence as a silent regression.
 */
const METRICS_DROPPED = Object.freeze([
  'ppr: personalized-PageRank timing removed. src/memory/ppr.ts no longer exists (it went in the file-native cutover) and nothing under src/ imports it, so the metric only ran against a stale dist/ artifact and measured an algorithm that is not on the product recall path. Graph scoring is GraphifyAdapter.scoreRelated, timed as graphExpansion.',
  'ftsBuildMs: no index build exists to time on the file-native recall path.',
  'fixtureProjectionWriteMs/fixtureProjectionBytes/fixtureProjectionRatio: replaced by graphProjectionMs/graphProjectionBytes/graphProjectionRatio measured through the actual GraphifyAdapter.update() and installed private Python runtime.',
]);

export function parseArgs(argv) {
  const result = {
    counts: DEFAULT_COUNTS,
    samples: DEFAULT_SAMPLES,
    warmup: DEFAULT_WARMUP,
    targetP95Ms: DEFAULT_TARGET_P95_MS,
    keep: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--counts=')) {
      result.counts = arg.slice('--counts='.length).split(',').map(Number).filter((value) => Number.isInteger(value) && value > 0);
    } else if (arg.startsWith('--count=')) {
      const value = Number(arg.slice('--count='.length));
      result.counts = Number.isInteger(value) && value > 0 ? [value] : [];
    } else if (arg.startsWith('--samples=')) {
      result.samples = Number(arg.slice('--samples='.length));
    } else if (arg.startsWith('--warmup=')) {
      result.warmup = Number(arg.slice('--warmup='.length));
    } else if (arg.startsWith('--target-p95-ms=')) {
      result.targetP95Ms = Number(arg.slice('--target-p95-ms='.length));
    } else if (arg === '--keep') {
      result.keep = true;
    }
  }
  if (result.counts.length === 0) throw new Error('At least one positive benchmark count is required');
  if (!Number.isInteger(result.samples) || result.samples < 3 || result.samples > 200) throw new Error('--samples must be 3..200');
  if (!Number.isInteger(result.warmup) || result.warmup < 0 || result.warmup > 50) throw new Error('--warmup must be 0..50');
  if (!(result.targetP95Ms > 0 && Number.isFinite(result.targetP95Ms))) throw new Error('--target-p95-ms must be positive');
  return result;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil(fraction * ordered.length) - 1));
  return ordered[index];
}

function summarize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    samples: values.length,
    minMs: Number(Math.min(...values).toFixed(3)),
    meanMs: Number((total / Math.max(1, values.length)).toFixed(3)),
    p50Ms: Number(percentile(values, 0.50).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

async function timeSamples(operation, samples, warmup, afterSample, label) {
  const progress = (phase, index, total, elapsedMs) => {
    if (label) process.stderr.write(`[memory-benchmark] ${label} ${phase} ${index + 1}/${total}${elapsedMs === undefined ? ' started' : ` operation=${elapsedMs.toFixed(3)}ms`}\n`);
  };
  for (let index = 0; index < warmup; index += 1) {
    progress('warmup', index, warmup);
    const started = performance.now();
    await operation(index, true);
    progress('warmup', index, warmup, performance.now() - started);
    await afterSample?.();
  }
  const timings = [];
  for (let index = 0; index < samples; index += 1) {
    progress('sample', index, samples);
    const started = performance.now();
    await operation(index, false);
    const elapsed = performance.now() - started;
    timings.push(elapsed);
    progress('sample', index, samples, elapsed);
    await afterSample?.();
  }
  return summarize(timings);
}

/** The vault is a file tree, so its footprint is the tree, not one database file. */
async function treeBytes(root) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue;
    bytes += (await stat(path.join(entry.parentPath, entry.name)).catch(() => ({ size: 0 }))).size;
    files += 1;
  }
  return { bytes, files };
}

function memoryId(index) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function revisionId(index) {
  return `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function segmentLabel(no) {
  return no >= 1 && no <= 26 ? String.fromCharCode(64 + no) : `S${no}`;
}

const VAULT_FOLDER = `General/${fileNativeProjectNamespace(PROJECT_ID)}/${fileNativePrincipalNamespace(PRINCIPAL_ID)}`;
const HUB_FILE = `${VAULT_FOLDER}/hot-${segmentLabel(1)}.md`;
const syntheticFile = (segmentIndex) => `${VAULT_FOLDER}/synthetic-${segmentLabel(segmentIndex + 1)}.md`;
const segmentOf = (index) => Math.floor((index - 1) / ENTRIES_PER_SEGMENT);
const sourceFile = (index) => (index === 0 ? HUB_FILE : syntheticFile(segmentOf(index)));
const canonicalKey = (index) => (index === 0 ? HOT_KEY : `synthetic.item.${index}`);

function valueTextFor(index) {
  if (index === 0) return `Synthetic root node for exact ${HOT_KEY} query.`;
  const needle = index % NEEDLE_EVERY === 0 ? ` ${LEXICAL_TERM}` : '';
  return `Synthetic memory item ${index} category ${index % 1000}${needle}.`;
}

function makeEntry(index, createdAt, relations) {
  const valueText = valueTextFor(index);
  return {
    memoryId: memoryId(index), revisionId: revisionId(index), revisionNo: 1,
    canonicalKey: canonicalKey(index), kind: 'observation', state: 'active',
    importance: 0.5, pinned: false, enforcement: 'none', valueText,
    valueHash: createHash('sha256').update(valueText, 'utf8').digest('hex'),
    createdAt, updatedAt: createdAt, relations,
  };
}

function makeSegment(input) {
  return {
    schemaVersion: 1,
    fileId: `mf_benchmark_${input.topicKey}_${input.segmentNo}`,
    relativePath: `${VAULT_FOLDER}/${input.topicKey}-${segmentLabel(input.segmentNo)}.md`,
    contextFamily: 'general', principalId: PRINCIPAL_ID, projectId: PROJECT_ID,
    topicKey: input.topicKey, segmentNo: input.segmentNo,
    ...(input.previousFile ? { previousFile: input.previousFile } : {}),
    ...(input.nextFile ? { nextFile: input.nextFile } : {}),
    createdAt: input.stamp, updatedAt: input.stamp, entries: input.entries,
  };
}

async function writeSegment(vaultRoot, segment) {
  await writeFile(path.join(vaultRoot, ...segment.relativePath.split('/')), serializeVaultSegment(segment), 'utf8');
}

/**
 * Benchmark-only fixture seeder. The recall gate needs the same active-entry, single-revision and
 * relation shape a committed vault has, not 100k synthetic provenance events, so the segment files
 * are written straight through the production codec instead of one MemoryService.commit per item.
 * The real production commit below stays as the write-path-at-scale probe.
 */
export async function seedVault(vaultRoot, count, spokes) {
  await mkdir(path.join(vaultRoot, ...VAULT_FOLDER.split('/')), { recursive: true });
  const baseTime = Date.now() - count;
  const stamp = new Date(baseTime).toISOString();
  const syntheticSegments = Math.max(0, Math.ceil((count - 1) / ENTRIES_PER_SEGMENT));
  const relation = (targetIndex) => ({
    targetMemoryId: memoryId(targetIndex), targetFile: sourceFile(targetIndex),
    relation: RELATION, weight: RELATION_WEIGHTS[RELATION],
  });

  const buildHub = (withRelations) => {
    const relations = [];
    if (withRelations) for (let index = 1; index <= Math.min(spokes, 500); index += 1) relations.push(relation(index));
    return makeSegment({ topicKey: 'hot', segmentNo: 1, entries: [makeEntry(0, baseTime, relations)], stamp });
  };
  const buildSynthetic = (segmentIndex, withRelations) => {
    const first = 1 + segmentIndex * ENTRIES_PER_SEGMENT;
    const last = Math.min(count - 1, first + ENTRIES_PER_SEGMENT - 1);
    const entries = [];
    for (let index = first; index <= last; index += 1) {
      const relations = [];
      if (withRelations && index <= spokes) {
        relations.push(relation(index <= 500 ? 0 : ((index - 501) % 500) + 1));
        if (index <= 500) for (let child = 500 + index; child <= spokes; child += 500) relations.push(relation(child));
      }
      entries.push(makeEntry(index, baseTime + index, relations));
    }
    return makeSegment({
      topicKey: 'synthetic', segmentNo: segmentIndex + 1, entries, stamp,
      ...(segmentIndex > 0 ? { previousFile: syntheticFile(segmentIndex - 1) } : {}),
      ...(segmentIndex < syntheticSegments - 1 ? { nextFile: syntheticFile(segmentIndex + 1) } : {}),
    });
  };

  const bulkStarted = performance.now();
  await writeSegment(vaultRoot, buildHub(false));
  for (let index = 0; index < syntheticSegments; index += 1) await writeSegment(vaultRoot, buildSynthetic(index, false));
  const bulkSeedMs = performance.now() - bulkStarted;

  const graphStarted = performance.now();
  await writeSegment(vaultRoot, buildHub(true));
  for (let index = 0; spokes > 0 && index <= segmentOf(spokes); index += 1) await writeSegment(vaultRoot, buildSynthetic(index, true));
  const graphSeedMs = performance.now() - graphStarted;

  return { bulkSeedMs, graphSeedMs };
}

export async function benchmarkCount(count, options) {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `agent-core-memory-bench-${count}-`));
  const config = await benchmarkMemoryConfig(root, REPO_ROOT);
  const scope = { principalId: PRINCIPAL_ID, projectId: PROJECT_ID };
  const graphQueryBudget = config.graphNodeCap;
  // Deliberately overflow that budget so bound enforcement is exercised rather than assumed.
  const spokes = Math.min(Math.max(0, count - 1), graphQueryBudget + 500);
  const transport = new BenchmarkMemoryTransport();
  const graphify = new GraphifyAdapter(config.fileNative, {
    pythonPath: config.fileNative.pythonPath,
    bridgePath: path.join(config.fileNative.projectRoot, 'scripts', 'memory', 'graphify-bridge.py'),
    nodeCap: config.graphNodeCap, edgeCap: config.graphEdgeCap, maxHops: config.graphMaxHops,
  });
  const service = new MemoryService(config, undefined, { supabaseDirectTransport: transport, graphify });
  let keepRoot = options.keep;
  let result = null;

  try {
    const initialHealth = await graphify.health();
    if (initialHealth.errorCode === 'MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE') throw new Error(initialHealth.errorCode);
    const seeded = await seedVault(config.fileNative.vaultRoot, count, spokes);
    const beforeProjection = await treeBytes(config.fileNative.memoryRoot);

    const projectionStarted = performance.now();
    const projection = await graphify.update([]);
    const graphProjectionMs = performance.now() - projectionStarted;
    if (projection.nodes !== count || projection.edges !== 2 * spokes) throw new Error('Real Graphify projection does not match the seeded vault');
    process.stderr.write(`[memory-benchmark] ${count} real Graphify projection ready; synchronizing isolated RPC fixture\n`);
    const initialSyncStarted = performance.now();
    const initialSync = await service.syncDirectMemory(scope);
    const initialFixtureSyncMs = performance.now() - initialSyncStarted;
    if (initialSync?.state !== 'synced') throw new Error(`Benchmark initial fixture synchronization failed: ${initialSync?.errorCode ?? 'missing receipt'}`);
    const afterProjection = await treeBytes(config.fileNative.memoryRoot);
    const graphProjectionBytes = (await treeBytes(config.fileNative.graphRoot)).bytes;

    // Taken before the production commit so the counts describe the seeded corpus itself.
    const status = await service.status(scope);
    if (!status.healthy || !status.graphify?.healthy || !status.supabaseDirect?.healthy) throw new Error(`Benchmark components are not healthy: ${status.integrity}`);
    // Without this the whole benchmark passes against a vault the runtime cannot read: an
    // unparseable corpus yields 0 items, 0 recall and a faster preflight, i.e. a greener gate.
    const activeItems = Number(status.counts?.active_items ?? 0);
    const relationEdges = Number(status.counts?.edges ?? 0);
    if (activeItems !== count) {
      throw new Error(`benchmark fixture unreadable: runtime seeded ${activeItems} of ${count} active items (malformed_files=${status.counts?.malformed_files ?? 'n/a'}, integrity=${status.integrity})`);
    }
    if (relationEdges !== 2 * spokes) {
      throw new Error(`benchmark fixture relations unreadable: runtime sees ${relationEdges} edges, expected ${2 * spokes} for ${spokes} spokes`);
    }

    const productionCommitStarted = performance.now();
    const productionCommit = await service.commit({
      scope,
      canonicalKey: `benchmark.production.commit.${count}`,
      kind: 'fact',
      value: `Production commit marker after ${count} active synthetic memories.`,
      sourceType: 'benchmark',
    });
    const productionCommitMs = performance.now() - productionCommitStarted;
    process.stderr.write(`[memory-benchmark] ${count} healthy components and production commit verified; measuring recall\n`);

    // service.search returns at most config.recallItemBudget rows and pads them with graph neighbours
    // the lexical probe never matched, so hits.length is a response size, not a lexical match count.
    // The rows that really matched are the ones whose ranking explanation names the term.
    let lexicalReturnedHits = 0;
    let lexicalTermMatches = 0;
    const lexicalSearch = await timeSamples(async () => {
      const hits = (await service.search({ scope, query: LEXICAL_TERM })).hits;
      lexicalReturnedHits = hits.length;
      lexicalTermMatches = hits.filter((hit) => (hit.whyMatched?.lexicalTerms ?? []).includes(LEXICAL_TERM)).length;
    }, options.samples, options.warmup, undefined, `${count} lexical`);
    const lexicalNeedlesSeeded = Math.floor((count - 1) / NEEDLE_EVERY);
    // Every seeded needle carries the term, so recall may only ever be clipped by the item budget.
    const lexicalTermMatchesExpected = Math.min(lexicalNeedlesSeeded, config.recallItemBudget);

    let related = null;
    const graphExpansion = await timeSamples(async () => {
      related = await graphify.queryRelated([HUB_MEMORY_ID], graphQueryBudget);
    }, options.samples, options.warmup, undefined, `${count} graph`);
    if (!related) throw new Error('Graph expansion did not produce a result');

    // Reported straight off the adapter's own return value. Nothing here is sliced by the benchmark,
    // so `relatedNodes`/`truncated` measure the product's cap enforcement instead of restating it.
    const graphEdges = new Set();
    for (const hit of related.values()) {
      for (let step = 1; step < hit.path.length; step += 1) graphEdges.add(`${hit.path[step - 1]}->${hit.path[step]}`);
    }
    const graphMeasured = {
      // queryRelated's own return size, i.e. what the budget it was handed is supposed to bound.
      relatedNodes: related.size,
      seedNodes: 1,
      edges: graphEdges.size,
      seededSpokes: spokes,
      // The bound asserted below: the argument this benchmark passed to queryRelated.
      queryBudget: graphQueryBudget,
      // The adapter's own flag, which the retriever surfaces to callers as graphTruncated.
      truncated: related.truncated === true,
      // Every seeded neighbour is within two hops, so missing nodes were dropped by the bounds.
      dropped: related.size < spokes,
      nodeCapConfigSource: config.graphNodeCap,
      configuredEdgeCap: config.graphEdgeCap,
    };

    let lastPreflight = null;
    let lastRouteContextId;
    let closedLifecycles = 0;
    const preflightTiming = await timeSamples(async (index, warmup) => {
      lastRouteContextId = randomUUID();
      lastPreflight = await service.preflight({
        scope,
        routeContextId: lastRouteContextId,
        task: HOT_KEY,
        context: warmup ? 'warmup' : undefined,
        expiresAt: Date.now() + 5 * 60_000 + index,
      });
    }, options.samples, options.warmup, async () => {
      const decision = await service.applyPostflight({
        scope, routeContextId: lastRouteContextId, contextId: lastPreflight.contextId,
        reasonCodes: ['TRANSIENT_OPERATION'], evidenceRefs: [],
      });
      if (decision.decision !== 'NO_DURABLE_MEMORY' || !decision.applied) throw new Error('Benchmark transient recall decision was not recorded');
      const closure = await service.closeLifecycleDurably({
        scope, routeContextId: lastRouteContextId, contextId: lastPreflight.contextId, reason: 'turn_finalize',
      });
      if (closure.lifecycle.postflightState !== 'CLOSED' || !closure.lifecycle.localDurableHash) throw new Error('Benchmark recall lifecycle did not close against the isolated transport');
      closedLifecycles++;
    }, `${count} preflight`);

    result = {
      count,
      environment: MEMORY_BENCHMARK_SCOPE,
      hardLifecycleMode: config.hardLifecycleMode,
      fixtureSync: { ...transport.calls, documentCount: transport.documents.size },
      closedLifecycles,
      activeItems,
      relationEdges,
      vaultFiles: afterProjection.files,
      vaultBytes: afterProjection.bytes,
      vaultBytesBeforeProjection: beforeProjection.bytes,
      graphProjectionBytes,
      graphProjectionRatio: Number((graphProjectionBytes / Math.max(1, beforeProjection.bytes)).toFixed(4)),
      integrity: status.integrity,
      integrityDegraded: !status.healthy,
      ingest: {
        bulkSeedMs: Number(seeded.bulkSeedMs.toFixed(3)),
        bulkItemsPerSecond: Number((count / Math.max(0.001, seeded.bulkSeedMs / 1000)).toFixed(1)),
        graphSeedMs: Number(seeded.graphSeedMs.toFixed(3)),
        graphProjectionMs: Number(graphProjectionMs.toFixed(3)),
        initialFixtureSyncMs: Number(initialFixtureSyncMs.toFixed(3)),
        productionCommitAtScaleMs: Number(productionCommitMs.toFixed(3)),
        productionCommitMemoryId: productionCommit.memoryId,
      },
      lexicalSearch,
      // Response size, capped by recallItemBudget and padded with graph neighbours: it saturates at
      // the budget at every scale and so says nothing about how much of the corpus the probe matched.
      lexicalSearchReturnedHits: lexicalReturnedHits,
      // Of those, the rows the lexical probe genuinely matched. This is the recall signal.
      lexicalSearchTermMatches: lexicalTermMatches,
      lexicalTermMatchesExpected,
      lexicalNeedlesSeeded,
      recallItemBudget: config.recallItemBudget,
      graphExpansion,
      graph: graphMeasured,
      preflight: preflightTiming,
      // Also bounded by recallItemBudget above, so read it as "preflight filled its budget", not as
      // a measure of how much of the corpus was reachable.
      preflightHits: lastPreflight?.recalled?.length ?? 0,
      targetP95Ms: options.targetP95Ms,
      // Below 100k the gate is advisory: only the 100k run can fail on latency (pre-cutover rule).
      targetPassed: count < 100_000 || preflightTiming.p95Ms < options.targetP95Ms,
      root: options.keep ? root : undefined,
    };

    // Every gate is evaluated before anything throws. The gates are independent, so the first one to
    // fail must not hide the rest: a graph-cap failure has no business suppressing the 100k latency
    // verdict, and vice versa.
    const gateFailures = [];
    // A recall benchmark that recalls nothing is measuring an empty search, not memory.
    if (result.preflightHits === 0) gateFailures.push(`benchmark preflight recalled nothing for task ${HOT_KEY} against ${count} active items`);
    // Every needle carries the term, so the only legitimate reason to see fewer than this is the item
    // budget clipping the response. Anything less is lexical recall collapsing, which the old
    // `=== 0` guard could not see: graph padding keeps the response full even when nothing matched.
    if (result.lexicalSearchTermMatches < lexicalTermMatchesExpected) {
      gateFailures.push(`benchmark lexical recall collapsed: only ${result.lexicalSearchTermMatches} of the ${lexicalTermMatchesExpected} expected ${LEXICAL_TERM} matches came back (${lexicalNeedlesSeeded} needles seeded, recallItemBudget ${config.recallItemBudget}, ${result.lexicalSearchReturnedHits} hits returned in total)`);
    }
    // The seeding above deliberately overflows the budget handed to queryRelated, so a passing run
    // means the product truncated, not that the benchmark handed it a small enough input. Dropping
    // spokes without raising its own truncated flag is the same defect seen from the retriever's side.
    if (graphMeasured.relatedNodes > graphQueryBudget || (graphMeasured.dropped && !graphMeasured.truncated)) {
      gateFailures.push(`Graph recall budget not enforced: seeded ${spokes} spokes and passed budget ${graphQueryBudget} to GraphifyAdapter.queryRelated, which returned ${graphMeasured.relatedNodes} related nodes truncated=${graphMeasured.truncated} dropped=${graphMeasured.dropped}`);
    }
    if (graphMeasured.edges > config.graphEdgeCap) {
      gateFailures.push(`Graph edge cap exceeded: ${JSON.stringify(graphMeasured)}`);
    }
    if (count >= 100_000 && !result.targetPassed) {
      gateFailures.push(`100k preflight p95 ${preflightTiming.p95Ms} ms exceeds target ${options.targetP95Ms} ms`);
    }
    if (gateFailures.length > 0) {
      const error = new Error(`${gateFailures.length} benchmark gate(s) failed at count ${count}: ${gateFailures.join(' | ')}`);
      error.gateFailures = gateFailures;
      throw error;
    }
    return result;
  } catch (error) {
    keepRoot = true;
    if (error && typeof error === 'object') {
      if (!('benchmarkRoot' in error)) error.benchmarkRoot = root;
      if (result && !('benchmarkResult' in error)) error.benchmarkResult = result;
    }
    throw error;
  } finally {
    await service.close().catch(() => undefined);
    if (!keepRoot) await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const results = [];
  for (const count of options.counts) {
    process.stderr.write(`[memory-benchmark] seeding ${count.toLocaleString('en-US')} active memories\n`);
    const result = await benchmarkCount(count, options);
    results.push(result);
    process.stderr.write(`[memory-benchmark] ${count.toLocaleString('en-US')} p95 preflight=${result.preflight.p95Ms}ms vault=${result.vaultBytes} bytes\n`);
  }
  const hundredK = results.find((result) => result.count === 100_000);
  const projectionForOneMillion = hundredK ? {
    projectedBulkSeedMs: Number((hundredK.ingest.bulkSeedMs * 10).toFixed(0)),
    projectedVaultBytes: hundredK.vaultBytes * 10,
    note: 'Linear projection only; run --count=1000000 for an actual measurement when the local time/disk envelope permits.',
  } : undefined;
  const report = {
    benchmark: 'agent-core-deterministic-memory',
    environment: MEMORY_BENCHMARK_SCOPE,
    gateSummary: hundredK ? {
      memoryRecall100k: {
        observedP95Ms: hundredK.preflight.p95Ms,
        targetP95Ms: options.targetP95Ms,
        passed: hundredK.targetPassed,
        recalledPerPreflight: hundredK.preflightHits,
        integrity: hundredK.integrity,
        integrityDegraded: hundredK.integrityDegraded,
        environment: MEMORY_BENCHMARK_SCOPE,
      },
    } : {
      memoryRecall100k: {
        observedP95Ms: null,
        targetP95Ms: options.targetP95Ms,
        passed: null,
        note: 'Gate not evaluated because this invocation did not include 100000 items.',
      },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    options,
    results,
    projectionForOneMillion,
    metricsDropped: METRICS_DROPPED,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  const payload = {
    error: error instanceof Error ? error.message : String(error),
    gateFailures: error?.gateFailures,
    benchmarkRoot: error?.benchmarkRoot,
    benchmarkResult: error?.benchmarkResult,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  // The failed run's root is deliberately kept for diagnosis, and it is large (~122 MB at 100k).
  // Say so loudly, or it is orphaned in TEMP with nobody aware it exists.
  if (error?.benchmarkRoot) {
    process.stderr.write(`[memory-benchmark] FAILED RUN RETAINED FOR DIAGNOSIS: ${error.benchmarkRoot}\n`);
  }
  process.exitCode = 1;
});
