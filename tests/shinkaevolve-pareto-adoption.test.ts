import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRetrievalSeriesManifest } from '../src/learning/retrieval-series.js';
const file = fileURLToPath(new URL('../src/learning/retrieval-pareto.ts', import.meta.url));
const load = async () => {
  expect(existsSync(file), 'native Pareto implementation must exist').toBe(true);
  return import('../src/learning/retrieval-pareto.js');
};
const config = { resourceBasis: 'per-run', objectives: [
  { id: 'candidateRate', direction: 'maximize' },
  { id: 'resource.task.wallMs', direction: 'minimize' },
] };
const value = (value: number | null, resource = false) => ({ value,
  kind: resource ? 'operator-supplied' : 'verified-input', evidenceRefs: ['verification:fixture'] });
const row = (runId: string, quality: number | null, cost: number | null, extra = {}) => ({
  runId, reportId: 'report-' + runId, comparisonKey: 'cohort-one/validation', status: 'evaluable',
  resourceContext: { id: 'rig-one', evidenceRefs: ['verification:fixture-rig'] },
  metrics: { candidateRate: value(quality), 'resource.task.wallMs': value(cost, true) }, ...extra,
});
describe('SHINKA-P1 native Pareto', () => {
  it('adds an independent CLI mode without replacing coverage frontier', () => {
    const cli = fileURLToPath(new URL('../scripts/learning/analyze-retrieval.mjs', import.meta.url));
    const text = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
    expect(text).toContain('--pareto'); expect(text).toContain('--frontier');
    expect(readFileSync(cli, 'utf8')).toContain('createRetrievalPortfolio');
  });
  it('keeps tradeoffs, gives strict witnesses, preserves ties and is permutation invariant', async () => {
    const { analyzeRetrievalPareto } = await load();
    const rows = [row('a', .8, 10), row('b', .9, 9), row('c', .95, 12), row('d', .9, 9)];
    const before = structuredClone(rows); const out = analyzeRetrievalPareto(rows, config);
    expect(out.groups[0].frontierRunIds).toEqual(['b', 'c', 'd']);
    expect(out.groups[0].dominated[0]).toMatchObject({ runId: 'a', dominatedBy: [
      { runId: 'b', strictDimensions: ['candidateRate', 'resource.task.wallMs'] },
      { runId: 'd', strictDimensions: ['candidateRate', 'resource.task.wallMs'] },
    ] });
    expect(out.groups[0].equivalentGroups).toEqual([['b', 'd']]);
    expect(analyzeRetrievalPareto([...rows].reverse(), config)).toEqual(out);
    expect(rows).toEqual(before); expect(out.launchesExperiments).toBe(false);
    expect(out.approvalAuthority).toBe(false); expect(out.deploymentRecommendation).toBe(false);
  });
  it('does not let invalid high scores or missing resource context enter the frontier', async () => {
    const { analyzeRetrievalPareto } = await load();
    const out = analyzeRetrievalPareto([row('a', 1, 0, { status: 'failed' }),
      row('b', 1, 0, { resourceContext: undefined }), row('c', .1, 0)], config);
    expect(out.groups[0].frontierRunIds).toEqual(['c']);
    expect(out.excluded.map((x: any) => x.runId)).toEqual(['a']);
    expect(out.unknown.map((x: any) => x.runId)).toEqual(['b']);
  });
  it.each([null, undefined, NaN, Infinity, -Infinity])('keeps unknown metric %s out, never imputing zero', async missing => {
    const { analyzeRetrievalPareto } = await load();
    const bad: any = row('bad', .9, 0); bad.metrics['resource.task.wallMs'].value = missing;
    const out = analyzeRetrievalPareto([bad, row('zero', .8, 0)], config);
    expect(out.groups[0].frontierRunIds).toEqual(['zero']); expect(out.unknown[0].runId).toBe('bad');
  });
  it('partitions cohort/split and declared resource context', async () => {
    const { analyzeRetrievalPareto } = await load();
    const out = analyzeRetrievalPareto([row('a', .8, 10), row('b', .9, 9, { comparisonKey: 'other/holdout' }),
      row('c', 1, 0, { resourceContext: { id: 'other-rig', evidenceRefs: ['verification:x'] } })], config);
    expect(out.groups).toHaveLength(3); expect(out.groups.every((g: any) => g.dominated.length === 0)).toBe(true);
  });
  it('requires unique dimensions/IDs and bounded inputs', async () => {
    const { analyzeRetrievalPareto } = await load();
    expect(() => analyzeRetrievalPareto([row('a', .8, 1), row('a', .9, 0)], config)).toThrow(/DUPLICATE/);
    expect(() => analyzeRetrievalPareto([row('a', .8, 1), row('b', .9, 0, { reportId: 'report-a' })], config)).toThrow(/DUPLICATE/);
    expect(() => analyzeRetrievalPareto([], { ...config, objectives: [config.objectives[0], config.objectives[0]] })).toThrow();
    expect(() => analyzeRetrievalPareto(Array.from({length:101}, (_,i) => row('r'+i, .5, i)), config)).toThrow(/LIMIT/);
    expect(() => analyzeRetrievalPareto([], { ...config, objectives: [{ id:'evil()', direction:'maximize' },config.objectives[0]] })).toThrow();
  });
  it('accepts additive manifest fields while retaining legacy no-pareto manifests', () => {
    const manifest: any = { schemaVersion:1, protocol:{ id:'p', splits:{train:[],validation:['q'],holdout:[]},
      trainingExposure:{status:'not-established',evidenceRefs:[]} }, runs:[{id:'r',iteration:0,checkpoint:'c',status:'attempted'}] };
    expect(parseRetrievalSeriesManifest(manifest).runs).toHaveLength(1);
    manifest.analysis = { pareto: config }; manifest.runs[0].resourceContext = { id:'rig',evidenceRefs:['verification:rig'] };
    expect(parseRetrievalSeriesManifest(manifest).analysis).toEqual({pareto:config});
  });
});

import path from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { bytes, input, readJSON, report, run, temp } from './helpers/retrieval-report-fixtures.js';
it('Pareto CLI verifies real bundles, preserves unknown attempts and never overwrites output', async () => {
  const a=await report(input([true,true,false,false],[true,true,false,false],{experimentId:'pareto-a'}));
  const b=await report(input([true,true,false,false],[true,true,true,false],{experimentId:'pareto-b'}));
  expect(a.result.status,a.result.stderr).toBe(0);expect(b.result.status,b.result.stderr).toBe(0);
  const dir=await temp(),file=path.join(dir,'series.json'),out=path.join(dir,'pareto.json');
  const manifest:any={schemaVersion:1,protocol:{id:'pareto-protocol',splits:{train:[],validation:['q0','q1','q2','q3'],holdout:[]},
    trainingExposure:{status:'not-established',evidenceRefs:[]}},runs:[a,b].map((r,i)=>({
      id:'r'+i,iteration:i,checkpoint:'c'+i,status:'evaluable',split:'validation',report:r.output,
      resourceContext:{id:'same-rig',evidenceRefs:['verification:rig']},
      resources:[{dimension:'task.wallMs',value:i?8:10,evidenceRefs:['verification:clock']}],
      cumulativeResources:[{dimension:'task.wallMs',value:i?20:10,evidenceRefs:['verification:clock']}],
    })),analysis:{pareto:structuredClone(config)}};
  manifest.runs.push({id:'attempt-failed',iteration:2,checkpoint:'c2',status:'failed'});
  const original=bytes(manifest);await writeFile(file,original);
  const result=run('analyze-retrieval.mjs',['--pareto',file,'--output',out]);
  expect(result.status,result.stderr).toBe(0);
  const value=await readJSON(out);expect(value.groups[0].frontierRunIds).toEqual(['r1']);
  expect(value.excluded.map((r:any)=>r.runId)).toEqual(['attempt-failed']);
  expect(value.numericProvenance.entries.some((e:any)=>e.sources.some((s:any)=>s.kind==='operator-supplied'))).toBe(true);
  expect(value.numericProvenance.entries.some((e:any)=>e.sources.some((s:any)=>s.kind==='verified-input'))).toBe(true);
  expect(await readFile(file)).toEqual(original);
  const written=await readFile(out);
  expect(run('analyze-retrieval.mjs',['--pareto',file,'--output',out]).status).not.toBe(0);
  expect(await readFile(out)).toEqual(written);
  manifest.runs.pop();manifest.analysis.pareto.resourceBasis='cumulative';
  await writeFile(file,bytes(manifest));
  const cumulative=path.join(dir,'cumulative.json');
  expect(run('analyze-retrieval.mjs',['--pareto',file,'--output',cumulative]).status).toBe(0);
  expect((await readJSON(cumulative)).groups[0].frontierRunIds).toEqual(['r0','r1']);
  const frontier=path.join(dir,'coverage.json');
  expect(run('analyze-retrieval.mjs',['--frontier',file,'--output',frontier]).status).toBe(0);
  expect((await readJSON(frontier)).semantics).toBe('union-coverage-redundancy-not-pairwise-pareto-dominance');
},30000);
