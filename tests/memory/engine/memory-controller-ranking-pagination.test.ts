import {afterEach, expect, test, vi} from 'vitest';
import {ControllerMemorySession, MemoryService} from '../../../src/memory/facade.js';
import * as retrieval from '../../../src/memory/retrieval.js';
import {decodeDisclosureCursor, disclosureCursorBinding, encodeDisclosureCursor} from '../../../src/memory/page.js';
import {disclosureDigest} from '../../../src/memory/disclosure.js';
import {cleanupRankingFixtures, data, fakeEmbedder, NOW, rankingFixture, SCOPE} from './helpers/memory-ranking-policy.js';

afterEach(cleanupRankingFixtures);
for (const policy of ['baseline-v1','fusion-feedback-v1'] as const) test(`${policy} pagination preserves ties, clock and controller handoff without duplicate/skip`, async () => {
  const {service} = await rankingFixture();
  const whole = data(await service.controller(SCOPE,policy).recall({query:'quasar',limit:20}));
  const ids:string[] = []; let cursor:string|undefined;
  do {
    const page = data(await service.controller({...SCOPE,controllerId:'controller-b',sessionId:'handoff'},policy).recall({query:'quasar',limit:1,...(cursor ? {cursor} : {})}));
    ids.push(...page.hits.map(hit => hit.id)); cursor = page.nextCursor;
    vi.setSystemTime(Date.now() + 86_400_000);
  } while(cursor);
  expect(ids).toEqual(whole.hits.map(hit => hit.id)); expect(new Set(ids).size).toBe(ids.length);
});
test('candidate feedback change invalidates cursor even if IDs stay in the same order', async () => {
  const {service} = await rankingFixture(); const session = service.controller(SCOPE,'fusion-feedback-v1');
  const first = data(await session.recall({query:'quasar',limit:1}));
  await service.feedback(first.hits[0]!.id,'helpful-page','helpful');
  await expect(session.recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
});
test('host policy change invalidates a cursor with identical ranking scores and order', async () => {
  const {service,internal} = await rankingFixture();
  const records = [...internal.records.values()].filter((record:any) => record.id !== 'foreign');
  const fixed = retrieval.searchMemories(records,'quasar',{limit:records.length,maxNeighbors:0},undefined,records.length,Date.now());
  vi.spyOn(retrieval,'searchMemories').mockReturnValue(fixed);
  const first = data(await service.controller(SCOPE).recall({query:'quasar',limit:1}));
  await expect(service.controller(SCOPE,'fusion-feedback-v1').recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
});
test('semantic availability and same-score semantic identity changes invalidate continuation', async () => {
  const {service,internal} = await rankingFixture(fakeEmbedder());
  const original = internal.index.semanticContext.bind(internal.index);
  const semantic = vi.spyOn(internal.index,'semanticContext');
  const first = data(await service.controller(SCOPE,'fusion-feedback-v1').recall({query:'quasar',limit:1}));
  semantic.mockResolvedValue(null);
  await expect(service.controller(SCOPE,'fusion-feedback-v1').recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
  for (const revision of ['provider-change','model-change','representation-change']) {
    semantic.mockImplementation(async (...args:any[]) => ({...await original(...args),revision}));
    await expect(service.controller(SCOPE,'fusion-feedback-v1').recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
  }
});
test('score-only and rank-revision-only changes invalidate continuation while scope remains fail-closed', async () => {
  const {service,internal} = await rankingFixture();
  const records = [...internal.records.values()].filter((record:any) => record.id !== 'foreign');
  let revision = 'ranking-state-one', score = 1;
  const backend:any = {root:internal.store.paths.root,resolveWorkspace:(s:string)=>s,snapshot:async()=>records,
    rank:async()=>({results:records.map((record:any)=>({record,score})),rankingRevision:revision}),
    read:async()=>null,inScope:()=>true,freshness:async()=>'unknown',recordExposure:async()=>undefined};
  const session = new ControllerMemorySession(backend,SCOPE);
  const first = data(await session.recall({query:'quasar',limit:1}));
  score = 2; await expect(session.recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
  score = 1; revision = 'ranking-state-two'; await expect(session.recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
  for (const change of [{workspaceKey:'foreign'},{taskId:'foreign-task'}]) await expect(new ControllerMemorySession(backend,{...SCOPE,...change}).recall({query:'quasar',cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_SCOPE_MISMATCH'});
});
test('restart observes feedback changes; baseline continuation ignores salience and access counters', async () => {
  const {service,root} = await rankingFixture();
  const first = data(await service.controller(SCOPE,'fusion-feedback-v1').recall({query:'quasar',limit:1}));
  const baseline = data(await service.controller(SCOPE).recall({query:'quasar',limit:1}));
  const restarted = await MemoryService.initialize(root,root);
  await restarted.feedback('z-rich','restart-helpful','helpful'); await restarted.read('a-thin');
  await expect(restarted.controller(SCOPE,'fusion-feedback-v1').recall({query:'quasar',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
  expect(data(await restarted.controller(SCOPE).recall({query:'quasar',limit:1,cursor:baseline.nextCursor})).hits).toHaveLength(1);
});
test('map recall is deterministic, rank-free and bounded at minimum budget', async () => {
  const {service,internal} = await rankingFixture(fakeEmbedder());
  const semantic = vi.spyOn(internal.index,'semanticContext'); const salience = vi.spyOn(internal.feedbackStore,'salienceMap');
  const first = data(await service.controller(SCOPE,'fusion-feedback-v1').recall({limit:1}));
  await service.feedback('z-rich','map-feedback','helpful'); vi.setSystemTime(Date.parse(NOW)+86_400_000);
  const next = data(await service.controller({...SCOPE,controllerId:'other'},'fusion-feedback-v1').recall({limit:1,cursor:first.nextCursor}));
  expect(next.hits[0]!.id).not.toBe(first.hits[0]!.id); expect(semantic).not.toHaveBeenCalled(); expect(salience).not.toHaveBeenCalled();
  const minimum = await service.controller(SCOPE,'fusion-feedback-v1').recall({budget:{maxBytes:512}});
  expect(minimum.metrics.payloadBytes).toBeLessThanOrEqual(512); expect(minimum.metrics.payloadBytes).toBe(Buffer.byteLength(JSON.stringify(minimum)));
});
test('old snapshot contract never silently resumes an offset', async () => {
  const {service} = await rankingFixture(); const session = service.controller(SCOPE);
  const first = data(await session.recall({query:'quasar',limit:1}));
  const prior = decodeDisclosureCursor(first.nextCursor!);
  const cursor = encodeDisclosureCursor({...prior,snapshot:disclosureCursorBinding(disclosureDigest(['old-snapshot-v1']))});
  await expect(session.recall({query:'quasar',limit:1,cursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
});
