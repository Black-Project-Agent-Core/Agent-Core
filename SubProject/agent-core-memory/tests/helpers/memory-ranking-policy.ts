import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect, vi} from 'vitest';
import {initializeStandaloneMemory, type Budgeted, type MemoryEmbedder} from '../../src/index.js';

export const NOW = '2026-10-09T12:00:00.000Z';
export const SCOPE = {workspaceKey:'workspace-a', taskId:'ranking-task', controllerId:'controller-a'};
const roots:string[] = [];
export async function rankingFixture(embedder?:MemoryEmbedder, experience = false) {
  vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(NOW);
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-ranking-policy-')); roots.push(root);
  const service = await initializeStandaloneMemory({baseDir:root, memoryRoot:root, ...(embedder ? {embedder} : {}), ...(experience ? {experience:{enabled:true}} : {})});
  await service.batch([
    {op:'remember', id:'a-thin', value:{content:'quasar filler filler filler filler filler filler filler', provenance:{workspace:SCOPE.workspaceKey,files:[]}}},
    {op:'remember', id:'z-rich', value:{content:'quasar quasar quasar', provenance:{workspace:SCOPE.workspaceKey,files:[]}}},
    {op:'remember', id:'middle', value:{content:'quasar navigation route', provenance:{workspace:SCOPE.workspaceKey,files:[]}}},
    {op:'remember', id:'foreign', value:{content:'quasar foreign privileged distractor', provenance:{workspace:'workspace-b',files:[]}}},
  ]);
  return {root, service, internal:service as any};
}
export async function cleanupRankingFixtures() {
  vi.restoreAllMocks(); vi.useRealTimers();
  await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true})));
}
export function data<T>(page:Budgeted<T>):T {
  expect(page.status).not.toBe('insufficient-budget');
  if (page.status === 'insufficient-budget') throw new Error('fixture overflow');
  return page.data;
}
export function stableHits(page:any) {
  return data<any>(page).hits.map(({retrievalEvidence, ...hit}:any) => ({...hit, retrievalEvidence:retrievalEvidence && {contentDigest:retrievalEvidence.contentDigest,recordFingerprint:retrievalEvidence.recordFingerprint}}));
}
export function fakeEmbedder(model = 'synthetic-v1'):MemoryEmbedder {
  return {identity:{provider:'synthetic', model, dimensions:2}, embedDocuments:vi.fn(async (texts:string[]) => texts.map(() => [1,0]))};
}
