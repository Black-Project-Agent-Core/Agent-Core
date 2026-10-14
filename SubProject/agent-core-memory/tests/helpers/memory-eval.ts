/** Offline evaluation utilities. No engine result is used to author expected answers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const fixtureRoot = new URL('../fixtures/memory-lifecycle/', import.meta.url);
const seals: Record<string, string> = {
  'corpus.json': 'cfc39180e9cf32080b96c773b13b649b48da797d4fa992f40839e317546d496b',
  'cases.json': 'c01390fff0d440030c27214b352e9ac2318deb10417fc8b1ab0bfe50977ffa1b',
};
export function readSealed(name: string): any {
  const bytes = readFileSync(new URL(name, fixtureRoot));
  assert.equal(sha256(bytes), seals[name], `Sealed fixture changed: ${name}; version and review a new oracle explicitly`);
  return JSON.parse(bytes.toString('utf8'));
}
export const corpus = readSealed('corpus.json');
export const cases = readSealed('cases.json');
export const fixtureSeals = seals;
export type Source = { kind: string; id: string; revision: string };
export function expectedItems(source: Source): any[] {
  return corpus.mandatoryItems.map(({ sourceLabels, ...item }: any) => {
    assert.deepEqual(sourceLabels, ['recovery-r17']);
    return { ...item, sourceRefs: [{ ...source }] };
  });
}
/** Only the generated UUID is learned at initial source binding; no goal content is copied. */
function expectedGoal(id: string) {
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'Invalid bound goal UUID');
  return {id, kind:'goal', text:corpus.goal, critical:true, state:'active', sourceRefs:[], verification:{status:'unverified',evidence:[]}};
}
export function bindGoalId(goal: any): string {
  assert.equal(typeof goal?.id, 'string', 'Missing goal UUID');
  assert.deepEqual(goal, expectedGoal(goal.id), 'Initial goal shape mismatch');
  return goal.id;
}
/** Compare whole labeled objects, not substring recall or the engine's own score. */
export function judgeItems(actual: any[], source: Source, goalId?: string) {
  const expected = expectedItems(source);
  const goals = actual.filter(item => item.kind === 'goal');
  if (goalId !== undefined || goals.length) {
    assert.equal(typeof goalId, 'string', 'Goal identity must be bound before evaluation');
    assert.equal(goals.length, 1, 'Exactly one bound goal is required');
    assert.deepEqual(goals[0], expectedGoal(goalId!), 'Goal shape or bound identity mismatch');
  }
  assert.equal(new Set(actual.map(i => i.id)).size, actual.length, 'Duplicate assertion ID');
  for (const item of expected) assert.deepEqual(actual.find(i => i.id === item.id), item, `Mandatory item/ref mismatch: ${item.id}`);
  const allowed = new Set([...expected.map(i => i.id), 'supporting-log']);
  for (const item of actual) {
    if (item.kind === 'goal') {
      // The full goal was checked above, including every ref and verification field.
    } else {
      assert(allowed.has(item.id), `Unsupported assertion: ${item.id}`);
      if (item.id === 'supporting-log') assert.deepEqual(item, corpus.workloads.supportingItem);
    }
  }
  assert.equal(actual.filter(i => i.kind === 'next-action')[0]?.text, corpus.expectedNextAction);
  assert.deepEqual(actual.filter(i => i.kind === 'obligation').map(i => i.text), corpus.expectedObligations);
  return { mandatoryMatched: expected.length + goals.length, mandatoryExpected: expected.length + (goalId ? 1 : 0), goalMatched: goals.length, unsupportedAssertions: 0, obligationMatched: 1 };
}
export function judgeEvidence(text: string) {
  assert.equal(sha256(Buffer.from(text, 'utf8')), corpus.evidence.sha256, 'Original evidence byte digest mismatch');
  assert.equal(text, corpus.evidence.text);
  for (const answer of Object.values(corpus.historicalAnswers)) assert(text.includes(answer as string));
}
export class Meter {
  bytes = 0;
  calls = 0;
  responses: Array<{method: string; bytes: number; status?: string; budget?: number; estimatedTokens: number}> = [];
  async call<T>(method: string, run: () => Promise<T>, budget?: number): Promise<T> {
    const result: any = await run();
    const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    this.calls++;
    this.bytes += bytes;
    this.responses.push({method, bytes, estimatedTokens:Math.ceil(Array.from(JSON.stringify(result)).length/4), ...(result?.status ? {status: result.status} : {}), ...(budget ? {budget} : {})});
    if (budget !== undefined) {
      assert.equal(bytes, result.metrics.payloadBytes, 'Metric omits serialized response bytes');
      assert(bytes <= budget, `Payload overflow: ${bytes} > ${budget}`);
      assert.equal(result.metrics.estimatedTokens, Math.ceil(Array.from(JSON.stringify(result)).length / 4));
    }
    return result;
  }
  async expand(controller: any, source: Source, view = 'episode', budget = corpus.measurement.expansionMaxBytes) {
    let cursor: string | undefined, text = '', pages = 0;
    do {
      assert(++pages <= corpus.measurement.maximumPages, 'Non-terminating pagination');
      const result: any = await this.call('expand:' + view, () => controller.expand({source, view, budget: {maxBytes: budget}, ...(cursor ? {cursor} : {})}), budget);
      assert(['ok', 'partial'].includes(result.status), `Unavailable expansion: ${result.status}`);
      text += result.data.text;
      cursor = result.data.nextCursor;
    } while (cursor);
    return text;
  }
  summary() {
    assert.equal(this.calls, this.responses.length, 'Response call accounting mismatch');
    assert.equal(this.bytes, this.responses.reduce((sum, row) => sum + row.bytes, 0), 'Response byte accounting mismatch');
    return {bytes: this.bytes, calls: this.calls, responses: this.responses.map(row => ({...row}))};
  }
}
export async function timed<T>(run: () => Promise<T>) {
  const start = performance.now();
  const value = await run();
  return {value, elapsedMs: performance.now() - start};
}
export function distribution(samples: number[]) {
  assert(samples.length > 0);
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { samples, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}
export function compareLatency(baseline: number[], facade: number[]) {
  const a = distribution(baseline), b = distribution(facade);
  const medianRatio = b.median / a.median, p95Ratio = b.p95 / a.p95;
  return {baseline: a, facade: b, medianRatio, p95Ratio,
    thresholds: {medianRatio: corpus.measurement.latencyMedianRatioMax, p95Ratio: corpus.measurement.latencyP95RatioMax},
    status: medianRatio <= corpus.measurement.latencyMedianRatioMax && p95Ratio <= corpus.measurement.latencyP95RatioMax ? 'PASS' : 'FAIL'};
}
export async function storage(root: string) {
  let totalBytes = 0, fileCount = 0, snapshotReferences = 0;
  const categories: Record<string, number> = {}, objects = new Set<string>();
  async function walk(relative: string) {
    for (const entry of await readdir(path.join(root, relative), {withFileTypes: true})) {
      const rel = path.join(relative, entry.name), file = path.join(root, rel);
      if (entry.isDirectory()) await walk(rel);
      else if (entry.isFile()) {
        const bytes = (await stat(file)).size;
        totalBytes += bytes; fileCount++;
        const category = rel.split(path.sep)[0]; categories[category] = (categories[category] ?? 0) + bytes;
        if (rel.startsWith(path.join('archive', 'manifests'))) {
          const manifest = JSON.parse(await readFile(file, 'utf8'));
          if (manifest.objectDigest) {snapshotReferences++; objects.add(manifest.objectDigest);}
        }
      }
    }
  }
  await walk('');
  return {totalBytes, fileCount, categories, snapshotReferences, distinctReferencedObjects: objects.size,
    snapshotDedupRatio: objects.size ? snapshotReferences / objects.size : null,
    dedupDefinition: 'manifests with objectDigest / distinct referenced objectDigest; not compression ratio'};
}
/** A case is never PASS merely because a file or E-label exists. Every selector needs executed passing tests. */
export function resolveCases(testResults: any[], commands: Record<string, any> = {}, entries: any[] = cases.cases) {
  return entries.map((entry: any) => {
    const proofs = entry.requiredProofs.map((proof: any) => {
      if (proof.file === '@commands') return { ...proof, ...(commands[proof.titlePattern] ?? {status: 'NOT RUN'}) };
      const suites = testResults.filter(s => path.basename(s.name) === proof.file);
      const matches = suites.flatMap(s => s.assertionResults).filter(t => new RegExp(proof.titlePattern).test(t.fullName ?? t.title));
      return {...proof, status: !matches.length ? 'NOT RUN' : matches.some(t => t.status === 'failed') ? 'FAIL' : matches.every(t => t.status === 'passed') ? 'PASS' : 'SKIPPED', tests: matches.map(t => ({title: t.fullName ?? t.title, status: t.status}))};
    });
    const status = proofs.some((p: any) => p.status === 'FAIL') ? 'FAIL' : !proofs.length ? 'NOT RUN'
      : proofs.some((p: any) => p.status !== 'PASS') ? 'PARTIAL' : entry.unrun.length ? 'PARTIAL' : 'PASS';
    return {...entry, status, proofs};
  });
}

/** Exact repeated labeled text only; a lower bound, not semantic duplicate detection. */
export function repeatedLabeledBytes(texts: string[]) {
  const joined = texts.join('\n');
  let bytes = 0;
  for (const item of corpus.mandatoryItems) {
    const occurrences = joined.split(item.text).length - 1;
    bytes += Math.max(0, occurrences - 1) * Buffer.byteLength(item.text, 'utf8');
  }
  return bytes;
}
