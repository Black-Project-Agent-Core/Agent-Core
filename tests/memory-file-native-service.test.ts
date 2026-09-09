import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';
import { memoryRuntimeFiles } from './helpers/memory-fixture.js';

async function serviceFixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'ac-file-service-')); const cfg=loadConfig({AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE:'advisory'},root).memory;
 await mkdir(cfg.fileNative.ripgrepRoot,{recursive:true}); await copyFile(path.resolve('.tools','ripgrep',process.platform==='win32'?'rg.exe':'rg'),path.join(cfg.fileNative.ripgrepRoot,process.platform==='win32'?'rg.exe':'rg'));
 return {root,cfg,service:new MemoryService(cfg)};
}
const scope={principalId:'p1',projectId:'project'};

describe('MemoryService file-native backend parity',()=>{
 it('commits, revises, searches and preflights without changing public method shapes',async()=>{
  const f=await serviceFixture(); const first=await f.service.commit({scope,canonicalKey:'memory:canonical',kind:'decision',value:'Obsidian Markdown is canonical.',metadata:{contextFamily:'decision',topicKey:'memory'}});
  const revised=await f.service.revise({scope,memoryId:first.memoryId,value:'Obsidian Markdown is canonical; Graphify is derived.'}); expect(revised.revisionNo).toBe(2);
  const search=await f.service.search({scope,query:'Graphify derived'}); expect(search.hits[0]?.memoryId).toBe(first.memoryId);
  const preflight=await f.service.preflight({scope,routeContextId:'route-a',task:'Continue Graphify memory work',expiresAt:Date.now()+60000}); expect(preflight.contextId).toBeTruthy(); expect(preflight.recalled.some(x=>x.memoryId===first.memoryId)).toBe(true);
  const files=await memoryRuntimeFiles(f.root); expect(files.some(x=>x.endsWith('.md'))).toBe(true); expect(files.every(x=>/\.(md|json|jsonl|tmp)$/.test(x))).toBe(true);
  await f.service.close();
 });
 it('canonicalizes a relocated Agent Core root scope across postflight, recall-expansion, and continuity auxiliary state',async()=>{
  const f=await serviceFixture();const rooted={principalId:'p1',projectId:f.root};const first=await f.service.commit({scope:rooted,canonicalKey:'portable:root:a',kind:'fact',value:'portable root A',metadata:{contextFamily:'general',topicKey:'portable-root'}});const second=await f.service.commit({scope:rooted,canonicalKey:'portable:root:b',kind:'fact',value:'portable root B',metadata:{contextFamily:'general',topicKey:'portable-root'}});
  const pre=await f.service.preflight({scope:rooted,routeContextId:'route-portable-root',task:'verify portable root memory',expiresAt:Date.now()+60000});const decision=await f.service.applyPostflight({scope:rooted,routeContextId:'route-portable-root',contextId:pre.contextId,reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]});expect((await f.service.getWriteDecision(rooted,decision.decisionRecord.id))?.decisionType).toBe('NO_DURABLE_MEMORY');
  const expansion=await f.service.recordRecallExpansion({scope:rooted,contextId:pre.contextId,sourceMemoryId:first.memoryId,targetMemoryId:second.memoryId,depth:1,relationPath:['related_to'],reasonCode:'portable-root-test',score:.8});expect((await f.service.listRecallExpansions(rooted,pre.contextId)).some(x=>x.id===expansion.id)).toBe(true);
  const turn=await f.service.beginContinuityTurn(rooted,'route-portable-continuity','portable continuity task',undefined,{objective:'verify canonical project scope'});expect((await f.service.getContinuityTask(rooted,turn.taskId))?.taskId).toBe(turn.taskId);await f.service.close();
 });
 it('expands related memory, opens conflicts, and records NO_DURABLE_MEMORY postflight decisions',async()=>{
  const f=await serviceFixture(); const failure=await f.service.commit({scope,canonicalKey:'failure:x',kind:'failure',value:'vault segment corruption',metadata:{contextFamily:'failure',topicKey:'memory'}}); const solution=await f.service.commit({scope,canonicalKey:'procedure:y',kind:'procedure',value:'Move to Markdown',metadata:{contextFamily:'procedure',topicKey:'memory'},explicitRelations:[{targetMemoryId:failure.memoryId,relation:'resolved_by'}]});
  const preflight=await f.service.preflight({scope,routeContextId:'route-b',task:'Move memory to Markdown',expiresAt:Date.now()+60000});
  const expanded=await f.service.rememberMore({scope,contextId:preflight.contextId,seedMemoryIds:[solution.memoryId],reason:'causal_history'}); expect(expanded.expansions.some(x=>x.memoryId===failure.memoryId)).toBe(true);
  const conflict=await f.service.openConflict(scope,failure.memoryId,solution.memoryId,'test_conflict',{evidence:'fixture'}); expect(conflict.conflictId).toBeTruthy(); expect((await f.service.listOpenConflicts(scope)).length).toBe(1);
  const decision=await f.service.applyPostflight({scope,routeContextId:'route-b',contextId:preflight.contextId,reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]}); expect(decision.decision).toBe('NO_DURABLE_MEMORY'); expect(decision.semanticMutation).toBe(false); expect((await f.service.getWriteDecision(scope,decision.decisionRecord.id))?.decisionType).toBe('NO_DURABLE_MEMORY');
  await f.service.close();
 });
});
