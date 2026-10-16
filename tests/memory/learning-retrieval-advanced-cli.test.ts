import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { bytes, input, readJSON, report, run, temp } from './helpers/retrieval-report-fixtures.js';

function baseManifest(reports: Array<{ output: string; iteration: number; seed?: string }>) {
  return {
    schemaVersion: 1,
    protocol: {
      id: 'advanced-protocol',
      splits: { train: [], validation: ['q0','q1','q2','q3'], holdout: [] },
      trainingExposure: { status: 'not-established', evidenceRefs: [] },
    },
    runs: reports.map((item, index) => ({
      id: 'r' + index,
      iteration: item.iteration,
      checkpoint: 'checkpoint-' + item.iteration,
      split: 'validation',
      status: 'evaluable',
      report: item.output,
      ...(item.seed ? {
        seed: item.seed,
        independentSeed: true,
        seedEvidenceRefs: ['source:seed-' + item.seed],
      } : {}),
    })),
  };
}

it('profile output includes bounded numeric provenance from verified input and analysis output', async () => {
  const fixture = await report();
  const output = path.join(fixture.dir, 'profile-provenance.json');
  const result = run('analyze-retrieval.mjs', ['--profile', fixture.output, '--output', output]);
  expect(result.status, result.stderr).toBe(0);
  const value = await readJSON(output);
  expect(value.numericProvenance.schemaVersion).toBe(1);
  expect(value.numericProvenance.entries.length).toBeGreaterThan(0);
  expect(value.numericProvenance.entries.some((entry: any) =>
    entry.sources.some((source: any) => source.kind === 'verified-input'))).toBe(true);
  expect(value.reviewRequired).toBe(true);
  expect(value.memoryPersisted).toBe(false);
});

it('diversity mode reports best observed candidates per declared behavior cell without deployment authority', async () => {
  const first = await report(input([true,true,false,false],[true,false,false,false],{ experimentId:'diversity-a' }));
  const second = await report(input([true,true,false,false],[true,true,true,false],{ experimentId:'diversity-b' }));
  const dir = await temp();
  const file = path.join(dir, 'diversity-manifest.json');
  const output = path.join(dir, 'diversity.json');
  const manifest: any = baseManifest([
    { output:first.output, iteration:0 },
    { output:second.output, iteration:1 },
  ]);
  manifest.analysis = {
    diversity: {
      fitness: 'candidateRate',
      dimensions: [{ id:'candidateRate', min:0, max:1, bins:4 }],
    },
  };
  await writeFile(file, bytes(manifest));
  const result = run('analyze-retrieval.mjs', ['--diversity', file, '--output', output]);
  expect(result.status, result.stderr).toBe(0);
  const value = await readJSON(output);
  expect(value.kind).toBe('quality-diversity-archive');
  expect(value.candidateCount).toBe(2);
  expect(value.deploymentRecommendation).toBe(false);
  expect(value.generatesCandidates).toBe(false);
});

it('stability mode uses only explicitly independent repeated runs and never stops execution', async () => {
  const a0 = await report(input([true,true,false,false],[true,true,false,false],{ experimentId:'stable-a0' }));
  const b0 = await report(input([true,true,false,false],[true,false,false,false],{ experimentId:'stable-b0' }));
  const a1 = await report(input([true,true,false,false],[true,true,false,false],{ experimentId:'stable-a1' }));
  const b1 = await report(input([true,true,false,false],[true,false,false,false],{ experimentId:'stable-b1' }));
  const dir = await temp();
  const file = path.join(dir, 'stability-manifest.json');
  const output = path.join(dir, 'stability.json');
  const manifest: any = baseManifest([
    { output:a0.output, iteration:0, seed:'a0' },
    { output:b0.output, iteration:0, seed:'b0' },
    { output:a1.output, iteration:1, seed:'a1' },
    { output:b1.output, iteration:1, seed:'b1' },
  ]);
  manifest.analysis = {
    stability: { absoluteTolerance:0.01, zMultiplier:0, consecutiveWindows:1 },
  };
  await writeFile(file, bytes(manifest));
  const result = run('analyze-retrieval.mjs', ['--stability', file, '--output', output]);
  expect(result.status, result.stderr).toBe(0);
  const value = await readJSON(output);
  expect(value.status).toBe('stable-window-observed');
  expect(value.stopsExecution).toBe(false);
  expect(value.approvalAuthority).toBe(false);
});

it('stability remains insufficient when independent-seed evidence is absent', async () => {
  const first = await report(input(undefined,undefined,{ experimentId:'non-independent-a' }));
  const second = await report(input(undefined,undefined,{ experimentId:'non-independent-b' }));
  const dir = await temp();
  const file = path.join(dir, 'stability-insufficient.json');
  const output = path.join(dir, 'stability-insufficient-output.json');
  const manifest: any = baseManifest([
    { output:first.output, iteration:0 },
    { output:second.output, iteration:1 },
  ]);
  manifest.analysis = {
    stability: { absoluteTolerance:0.01, zMultiplier:1, consecutiveWindows:1 },
  };
  await writeFile(file, bytes(manifest));
  const result = run('analyze-retrieval.mjs', ['--stability', file, '--output', output]);
  expect(result.status, result.stderr).toBe(0);
  expect((await readJSON(output)).status).toBe('insufficient-data');
});
