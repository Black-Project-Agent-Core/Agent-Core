import {afterAll, afterEach, expect, test} from 'vitest';
import {mkdtemp, rm, writeFile, readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {initializeMemoryRoot, MemoryService} from '../../../src/memory/facade.js';
import {legacyExperience} from '../../../src/memory/experience-types.js';
import {corpus, cases, fixtureSeals, sha256, expectedItems, bindGoalId, judgeItems, judgeEvidence, Meter, timed, distribution, compareLatency, storage, resolveCases, repeatedLabeledBytes} from './helpers/memory-eval.js';

const engineSourceDigests=Object.fromEntries(await Promise.all(execFileSync('git',['ls-files','src'],{encoding:'utf8'}).trim().split('\n').filter(file=>existsSync(file)).map(async file=>[file,sha256(await readFile(file))])));
const engineSourceTreeDigest=sha256(JSON.stringify(engineSourceDigests));
const roots: string[] = [];
const results: any = {schemaVersion: 1, engineCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), datasetRevision:corpus.datasetRevision,
  fixtureSeals, harnessSourceDigest:sha256(await readFile(new URL(import.meta.url))), engineSourceTreeDigest, engineSourceDigests, startedAt:new Date().toISOString(), platform:{platform:process.platform, arch:process.arch, release:os.release(), node:process.version, npm:execFileSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/c','npm --version']:['--version'],{encoding:'utf8',windowsHide:true}).trim()},
  dependencyLockDigest:sha256(await readFile(new URL('../../../package-lock.json',import.meta.url))), measurement:corpus.measurement,
  models:{status:'NOT RUN', calls:0, tokens:null, cost:null, reason:'No model adapter, credentials or live controller used'}, histories:[], lexical:[], storage:[]};
async function root() {const dir=await mkdtemp(path.join(os.tmpdir(),'memory-t8-'));roots.push(dir);return dir;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
afterAll(async()=>{
  results.finishedAt=new Date().toISOString();
  results.processMemory=process.memoryUsage();
  results.processMemory.note='End-of-file process memory, not peak engine allocation or per-mode causation';
  if(process.env.T8_REPORT){await mkdir(path.dirname(process.env.T8_REPORT),{recursive:true});await writeFile(process.env.T8_REPORT,JSON.stringify(results,null,2)+'\n');}
});

test('sealed independent oracle rejects missing mandatory fact, fabricated reference and unsupported assertion',()=>{
  const source={kind:'artifact',id:'synthetic-bound-source',revision:'sha256:'+'a'.repeat(64)};
  const correct=expectedItems(source);
  expect(judgeItems(correct,source).mandatoryMatched).toBe(8);
  const missing=structuredClone(correct);missing.splice(1,1);
  expect(()=>judgeItems(missing,source)).toThrow('Mandatory item/ref mismatch');
  const fabricated=structuredClone(correct);fabricated[0].sourceRefs[0].revision='sha256:'+'f'.repeat(64);
  expect(()=>judgeItems(fabricated,source)).toThrow('Mandatory item/ref mismatch');
  expect(()=>judgeItems([...correct,{...correct[0],id:'invented-fact',text:'Windows recovery verified'}],source)).toThrow('Unsupported assertion');
  expect(()=>judgeEvidence(corpus.evidence.text.replace('Linux','Windows'))).toThrow('Original evidence byte digest mismatch');
  // Explicit red invocation is logged before the normal suite. It is off by default.
  if(process.env.T8_CORRUPT_ORACLE==='fact')judgeItems(missing,source);
  if(process.env.T8_CORRUPT_ORACLE==='ref')judgeItems(fabricated,source);
});

test('goal oracle rejects fabricated provenance, weakened critical flag and extra verification fields',()=>{
  const source={kind:'artifact',id:'synthetic-bound-source',revision:'sha256:'+'a'.repeat(64)};
  const goalId='b8f88d4c-5b18-4ec9-bc9e-e6b082d37f4e';
  const goal={id:goalId,kind:'goal',text:corpus.goal,critical:true,state:'active',sourceRefs:[],verification:{status:'unverified',evidence:[]}};
  expect(bindGoalId(goal)).toBe(goalId);
  expect(()=>judgeItems([...expectedItems(source),goal],source,goalId)).not.toThrow();
  for(const change of [{sourceRefs:[source]},{verification:{status:'unverified',evidence:[source]}},{critical:false},{verification:{status:'unverified',evidence:[],method:'invented-verifier'}},{extraAssertion:'invented'}]){
    expect(()=>bindGoalId({...goal,...change})).toThrow();
    expect(()=>judgeItems([...expectedItems(source),{...goal,...change}],source,goalId)).toThrow();
  }
});

test('goal oracle requires valid bound identity and exactly one complete goal',()=>{
  const source={kind:'artifact',id:'synthetic-bound-source',revision:'sha256:'+'a'.repeat(64)};
  const goalId='b8f88d4c-5b18-4ec9-bc9e-e6b082d37f4e';
  const goal={id:goalId,kind:'goal',text:corpus.goal,critical:true,state:'active',sourceRefs:[],verification:{status:'unverified',evidence:[]}};
  const values=expectedItems(source);
  expect(()=>judgeItems([...values,{...goal,id:'a8f88d4c-5b18-4ec9-bc9e-e6b082d37f4e'}],source,goalId)).toThrow();
  expect(()=>judgeItems([...values,goal],source)).toThrow();
  expect(()=>judgeItems([...values,{...goal,id:'not-a-uuid'}],source,'not-a-uuid')).toThrow();
  expect(()=>judgeItems(values,source,goalId)).toThrow();
  expect(()=>judgeItems([...values,goal,{...goal,id:'a8f88d4c-5b18-4ec9-bc9e-e6b082d37f4e'}],source,goalId)).toThrow();
});

test('meter snapshots preserve earlier phase rows and reconcile bytes and calls',async()=>{
  const meter=new Meter();
  await meter.call('discovery',async()=>({phase:'discovery'}));
  const discovery=meter.summary(),saved=structuredClone(discovery);
  await meter.call('expansion',async()=>({phase:'expanded detail'}));
  const selected=meter.summary();
  expect(discovery).toEqual(saved);
  for(const phase of [discovery,selected]){
    expect(phase.bytes).toBe(phase.responses.reduce((sum,row)=>sum+row.bytes,0));
    expect(phase.calls).toBe(phase.responses.length);
  }
  meter.responses[0].bytes=999;
  expect(discovery).toEqual(saved);
  expect(selected.responses[0].bytes).toBe(saved.responses[0].bytes);
});

test('case accounting refuses absent, skipped and failed boundary evidence',()=>{
  expect(cases.cases.map((c:any)=>c.id)).toEqual(Array.from({length:32},(_,i)=>'E'+String(i+1).padStart(2,'0')));
  expect(resolveCases([]).some((c:any)=>c.status==='PASS')).toBe(false);
  const row=(status:string)=>[{name:'memory-episodes.test.ts',assertionResults:[{title:'duplicate append replays',status}]}];
  expect(resolveCases(row('passed')).find((c:any)=>c.id==='E05').status).toBe('PASS');
  expect(resolveCases(row('pending')).find((c:any)=>c.id==='E05').status).toBe('PARTIAL');
  expect(resolveCases(row('failed')).find((c:any)=>c.id==='E05').status).toBe('FAIL');
  expect(resolveCases([]).find((c:any)=>c.id==='E29').status).toBe('NOT RUN');
});

test('duplicate-context lower bound counts actual repeated labels and ignores distinct text',()=>{
 const text=corpus.mandatoryItems[0].text;expect(repeatedLabeledBytes([text,text])).toBe(Buffer.byteLength(text));expect(repeatedLabeledBytes([text,'unrelated'])).toBe(0);
});

test('latency gates retain fixed thresholds and expose regressions rather than retuning',()=>{
  expect(compareLatency([10,10,10],[12,12,12]).status).toBe('PASS');
  expect(compareLatency([10,10,10],[13,13,13]).status).toBe('FAIL');
  expect(distribution([5,1,4,3,2])).toMatchObject({median:3,p95:5});
});

for(const eventCount of corpus.workloads.eventCounts)test(`sealed continuation workload with ${eventCount} events compares full history and capsule plus selected evidence`,async()=>{
  const dir=await root(), setupMeter=new Meter();
  const setupStart=performance.now();
  const service=await initializeMemoryRoot({baseDir:dir,memoryRoot:dir,experience:{enabled:true},consolidation:{review:async(plan:any)=>({digest:plan.digest,reviewer:'sealed-synthetic-reviewer',reason:'Synthetic observed recovery text and exact evidence reviewed'})}});
  const scope={workspaceKey:'agent-core',taskId:'repair-r17',controllerId:'controller-A'};
  const A=service.controller(scope);
  const artifact:any=await setupMeter.call('captureEvidence',()=>A.captureEvidence({operationId:'evidence-r17',source:{kind:'controller-text',text:corpus.evidence.text}}));
  expect(artifact.availability).toBe('available');
  judgeEvidence(await setupMeter.expand(A,artifact.source,'evidence'));
  let header:any=await setupMeter.call('startEpisode',()=>A.startEpisode({startKey:'repair-r17',goal:corpus.goal,sourceRefs:[]}));
  const initialContext:any=await setupMeter.call('getTaskContext:initial-goal-binding',()=>A.getTaskContext({budget:{maxBytes:512}}),512);
  expect(initialContext.data.episodeRef.id).toBe(header.id);
  const initialEpisode=JSON.parse(await setupMeter.expand(A,initialContext.data.episodeRef));
  expect(initialEpisode.events).toHaveLength(1);expect(initialEpisode.workingState).toHaveLength(1);
  const goalId=bindGoalId(initialEpisode.workingState[0]);
  const items=expectedItems(artifact.source);
  const first:any=await setupMeter.call('appendEvent',()=>A.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'mandatory-state',event:{kind:'observation',summary:'Preserve mandatory recovery state',sourceRefs:[artifact.source],stateChanges:[...items,corpus.workloads.supportingItem].map(item=>({op:'upsert',item}))}}));
  header.revision=first.revision;
  // Real reviewed promotion gives discovery -> record -> event -> original evidence lineage.
  const plan:any=await setupMeter.call('prepareConsolidation',()=>A.prepareConsolidation({episodeId:header.id,expectedRevision:header.revision,operationId:'prepare-old-success',proposal:{actions:[{actionId:'old-success',kind:'create',inputRefs:[first.eventRef,artifact.source],reason:'Retain synthetic local recovery for future retrieval',value:{content:'R17archivedsuccess: '+corpus.mandatoryItems.find((i:any)=>i.id==='past-success').text,experience:{...legacyExperience(),kind:'procedure',epistemic:'observation',sourceRefs:[first.eventRef,artifact.source]}}}]}}));
  const promoted:any=await setupMeter.call('applyConsolidation',()=>A.applyConsolidation({planId:plan.id,expectedPlanDigest:plan.digest,operationId:'apply-old-success'}));
  header.revision=promoted.episodeRevision;
  const original=promoted.canonicalRefs[0];
  await setupMeter.call('setRetention',()=>A.setRetention({memoryId:original.id,expectedRevision:original.revision,operationId:'archive-success',tier:'archive',reason:'Keep historical recovery with applicability and evidence',sourceRefs:[original]}));
  for(let n=header.revision;n<eventCount;n++){
    const appended:any=await setupMeter.call('appendEvent',()=>A.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'diagnostic-'+n,event:{kind:'observation',summary:corpus.workloads.eventSummaryPrefix+' '+n+' '+corpus.workloads.eventPadding,sourceRefs:[],stateChanges:[]}}));
    header.revision=appended.revision;
  }
  expect(header.revision).toBe(eventCount);
  const checkpointMeter=new Meter();
  const checkpointTimed=await timed(()=>checkpointMeter.call('checkpoint',()=>A.checkpoint({episodeId:header.id,expectedRevision:header.revision,operationId:'checkpoint-final',trigger:'handoff',budget:{maxBytes:corpus.measurement.capsuleMaxBytes}}),corpus.measurement.capsuleMaxBytes));
  expect(['ok','partial']).toContain((checkpointTimed.value as any).status);
  judgeItems([...(checkpointTimed.value as any).data.criticalItems,...(checkpointTimed.value as any).data.supportingItems],artifact.source,goalId);
  const corrupted=structuredClone((checkpointTimed.value as any).data.criticalItems);corrupted.find((i:any)=>i.id==='rare-constraint').text='Retry any operation ID';expect(()=>judgeItems(corrupted,artifact.source,goalId)).toThrow('Mandatory item/ref mismatch');
  const forged=structuredClone((checkpointTimed.value as any).data.criticalItems);forged.find((i:any)=>i.id==='past-success').sourceRefs[0].revision='sha256:'+'f'.repeat(64);expect(()=>judgeItems(forged,artifact.source,goalId)).toThrow('Mandatory item/ref mismatch');
  const setupElapsedMs=performance.now()-setupStart;
  const beforeReads=await storage(dir);
  const restartTimed=await timed(()=>MemoryService.initialize(dir,dir));
  const B=restartTimed.value.controller({...scope,controllerId:'controller-B',sessionId:'fresh-session'});
  const histories:any[]=[],capsules:any[]=[],warmups:any[]=[];
  const run=async(mode:'full-history'|'capsule')=>{
    const meter=new Meter(), decodedTexts:string[]=[];
    const measured=await timed(async()=>{
      const budget=mode==='full-history'?512:65536;
      const context:any=await meter.call('getTaskContext',()=>B.getTaskContext({budget:{maxBytes:budget}}),budget);
      expect(context.data.freshness).toBe('current');
      let actual:any[];
      if(mode==='full-history'){
        const episodeText=await meter.expand(B,context.data.episodeRef);decodedTexts.push(episodeText);
        const episode=JSON.parse(episodeText);
        expect(episode.events).toHaveLength(eventCount);
        actual=episode.workingState;
      }else{
        expect(context.data.capsule).toBeDefined();
        actual=[...context.data.capsule.criticalItems,...context.data.capsule.supportingItems];decodedTexts.push(JSON.stringify(context.data.capsule));
      }
      expect(actual.filter(i=>i.kind==='goal').map(i=>i.text)).toEqual([corpus.goal]);
      const correctness=judgeItems(actual,artifact.source,goalId);
      // Evidence is selected from the actual returned state, never from a hidden pre-known handle.
      const evidenceRef=actual.find(i=>i.id==='past-success').sourceRefs[0];
      const evidenceText=await meter.expand(B,evidenceRef,'evidence');decodedTexts.push(evidenceText);judgeEvidence(evidenceText);
      return correctness;
    });
    return {...meter.summary(),elapsedMs:measured.elapsedMs,correctness:measured.value,duplicateLabeledBytes:repeatedLabeledBytes(decodedTexts),duplicateContextRate:repeatedLabeledBytes(decodedTexts)/meter.bytes};
  };
  for(let i=0;i<corpus.measurement.warmups;i++){warmups.push({fullHistory:await run('full-history'),capsule:await run('capsule')});}
  for(let i=0;i<corpus.measurement.historyTrials;i++){
    // Alternating order balances warm-cache and background scheduling bias.
    if(i%2){capsules.push(await run('capsule'));histories.push(await run('full-history'));}
    else{histories.push(await run('full-history'));capsules.push(await run('capsule'));}
  }
  expect(capsules.every((c,i)=>c.bytes<histories[i].bytes)).toBe(true);
  const readMeter=new Meter();
  const discovered:any=await readMeter.call('recall:archive',()=>B.recall({query:'R17archivedsuccess',retention:'archive',limit:5,budget:{maxBytes:8192}}),8192);
  const hit=discovered.data.hits.find((h:any)=>h.id===original.id);expect(hit).toBeDefined();
  const selected={kind:'memory',id:hit.id,revision:hit.revision};
  const record=JSON.parse(await readMeter.expand(B,selected,'record'));
  expect(record.experience).toMatchObject({epistemic:'observation',verification:{status:'unverified'}});
  expect(record.content).toBe('R17archivedsuccess: '+corpus.mandatoryItems.find((i:any)=>i.id==='past-success').text);
  const eventRef=record.experience.sourceRefs.find((ref:any)=>ref.kind==='event');expect(eventRef).toBeDefined();
  const event=JSON.parse(await readMeter.expand(B,eventRef));
  expect(event.stateChanges.map((c:any)=>c.item.id)).toContain('past-success');
  judgeEvidence(await readMeter.expand(B,event.sourceRefs[0],'evidence'));
  const overflow:any=await readMeter.call('checkpoint:overflow',()=>B.checkpoint({episodeId:header.id,expectedRevision:header.revision,operationId:'too-small',trigger:'explicit',budget:{maxBytes:512}}),512);
  expect(overflow.status).toBe('insufficient-budget');
  const other=restartTimed.value.controller({...scope,workspaceKey:'other-project',controllerId:'outside'});
  await expect(other.expand({source:artifact.source,view:'evidence'})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
  const unknown:any=await readMeter.call('recall:unknown',()=>B.recall({query:corpus.adversarialSources[2].query}),8192);
  expect(unknown.data.hits).toHaveLength(0);
  const poison:any=await readMeter.call('capture:adversarial',()=>B.captureEvidence({operationId:'poison',source:{kind:'controller-text',text:corpus.adversarialSources[0].text}}));
  expect(poison.availability).toBe(corpus.adversarialSources[0].expectedAvailability);
  expect(poison.reason).toBe(corpus.adversarialSources[0].expectedReason);
  const afterReads=await storage(dir);
  results.histories.push({eventCount,warmups,capsuleDisclosure:{omittedSupportingItemIds:(checkpointTimed.value as any).data.omittedSupportingItemIds,criticalItems:(checkpointTimed.value as any).data.criticalItems.length,deepFetchRate:1,deepFetchDefinition:'Every measured trial fetches original evidence once; full history additionally pages the episode'},setup:{...setupMeter.summary(),elapsedMs:setupElapsedMs,note:'Initialization plus capture, state, promotion and retention; checkpoint response/call separated below, elapsed included in setup total'},checkpoint:{...checkpointMeter.summary(),elapsedMs:checkpointTimed.elapsedMs},restartMs:restartTimed.elapsedMs,
    fullHistory:{trials:histories,latency:distribution(histories.map(t=>t.elapsedMs))},capsule:{trials:capsules,latency:distribution(capsules.map(t=>t.elapsedMs))},
    efficiencyStatus:'PASS',continuation:{status:'PASS',kind:'deterministic replay only',expectedNextAction:corpus.expectedNextAction,live:'NOT RUN'},
    archivedDiscovery:{status:'PASS',rank:discovered.data.hits.findIndex((h:any)=>h.id===original.id)+1,relevantRecall:1},auxiliaryChecks:{...readMeter.summary(),rejectedScopeCalls:1,rejectedScopeResponseBytes:null,rejectedScopeNote:'Direct API throws MEMORY_SCOPE_MISMATCH; no serialized success response. Error transport encoding not measured'},
    capture:{accepted:1,rejected:1,stagedEvents:eventCount,reviewedUnverifiedPromotions:1,falseVerifiedPromotion:0,unauthorizedDurablePromotion:0,note:'Reviewed unverified observation promoted; no source assertion upgraded to verified'},
    preservation:{evidenceDigest:corpus.evidence.sha256,status:'PASS'},storageBeforeReads:beforeReads,storageAfterReads:afterReads,bytesPerEvent:beforeReads.totalBytes/eventCount,
    outcome:{status:'UNAVAILABLE',reason:'Replay did not execute the proposed recovery; no use/outcome or causation claim'}});
// Preserve the sealed workload and measured latency thresholds. The runner's
// outer allowance includes disk-backed setup and all trials on Windows.
},process.platform==='win32'?900000:240000);

for(const count of corpus.workloads.lexicalRecordCounts)test(`warm lexical ${count} records measures discovery and full selected workload with fixed latency guardrails`,async()=>{
  const dir=await root(),service=await initializeMemoryRoot({baseDir:dir,memoryRoot:dir,experience:{enabled:true}}),setupMeter=new Meter();
  const empty=await storage(dir),createStart=performance.now();
  for(let offset=0;offset<count;offset+=100){
    const operations=Array.from({length:Math.min(100,count-offset)},(_,i)=>({op:'remember',id:'lexical-'+String(offset+i).padStart(4,'0'),value:{title:'Synthetic recovery '+(offset+i),content:(offset+i===0?corpus.workloads.lexicalContent:'Distractor context '+(offset+i)+' ')+corpus.workloads.lexicalPadding,keywords:[],tags:[],context:'Engineering',category:'procedure',provenance:{workspace:'agent-core',files:[]}}}));
    await setupMeter.call('batch:remember',()=>service.batch(operations as any));
  }
  const setupMs=performance.now()-createStart,beforeReads=await storage(dir);
  const A=service.controller({workspaceKey:'agent-core',taskId:'lexical',controllerId:'eval'});
  const legacy:any[]=[],discovery:any[]=[],selected:any[]=[],warmups:any[]=[];
  async function baseline(){const meter=new Meter();const sample=await timed(()=>meter.call('legacy:search',()=>service.search(corpus.workloads.lexicalQuery,{limit:1,maxNeighbors:0,workspace:'agent-core'})));expect(sample.value[0].record.id).toBe('lexical-0000');expect(sample.value[0].record.content).toBe((corpus.workloads.lexicalContent+corpus.workloads.lexicalPadding).trim());return {...meter.summary(),elapsedMs:sample.elapsedMs};}
  async function facade(){const meter=new Meter();const sample=await timed(()=>meter.call('recall',()=>A.recall({query:corpus.workloads.lexicalQuery,limit:1,budget:{maxBytes:8192}}),8192));const page:any=sample.value;expect(page.data.hits[0].id).toBe('lexical-0000');const discoveryResult={...meter.summary(),elapsedMs:sample.elapsedMs,applicability:page.data.hits[0].applicability,verification:page.data.hits[0].verification,freshness:page.data.hits[0].freshness};
    const expansion=await timed(()=>meter.expand(A,{kind:'memory',id:page.data.hits[0].id,revision:page.data.hits[0].revision},'record'));
    expect(JSON.parse(expansion.value).content).toBe((corpus.workloads.lexicalContent+corpus.workloads.lexicalPadding).trim());
    return {discovery:discoveryResult,selected:{...meter.summary(),elapsedMs:sample.elapsedMs+expansion.elapsedMs}};
  }
  for(let i=0;i<corpus.measurement.warmups;i++){warmups.push({legacy:await baseline(),facade:await facade()});}
  for(let i=0;i<corpus.measurement.lexicalTrials;i++){
    let a:any,b:any;if(i%2){b=await facade();a=await baseline();}else{a=await baseline();b=await facade();}
    legacy.push(a);discovery.push(b.discovery);selected.push(b.selected);
  }
  const guard=compareLatency(legacy.map(x=>x.elapsedMs),discovery.map(x=>x.elapsedMs));
  // A failed provisional performance gate is report data, never silently converted to PASS or a correctness failure.
  const diagnostic:any[]=[];
  // Additional instrumented reads explain costs but are never mixed into guardrail samples.
  const owner:any=service;
  for(let i=0;i<3;i++)for(const mode of ['legacy','facade']){
    const timings:Record<string,{calls:number;ms:number}>={};const restores:Array<()=>void>=[];
    for(const [object,key,label] of [[owner.store,'snapshot','canonicalSnapshot'],[owner.feedbackStore,'strictForgottenIds','strictVisibility'],[owner.retrievalLedger,'record','exposureLedger'],[owner.index,'inspect','indexInspect']] as const){
      const original=object[key];if(typeof original!=='function')continue;
      object[key]=async function(...args:any[]){const start=performance.now();try{return await original.apply(this,args);}finally{const row=timings[label]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-start;}};restores.push(()=>{object[key]=original;});
    }
    try{const meter=new Meter();const measured=await timed(()=>mode==='legacy'?meter.call('legacy:search',()=>service.search(corpus.workloads.lexicalQuery,{limit:1,maxNeighbors:0,workspace:'agent-core'})):meter.call('recall',()=>A.recall({query:corpus.workloads.lexicalQuery,limit:1,budget:{maxBytes:8192}}),8192));diagnostic.push({mode,...meter.summary(),elapsedMs:measured.elapsedMs,timings});}
    finally{for(const restore of restores)restore();}
  }
  results.lexical.push({count,warmups,diagnostic,legacy,discovery,selected,guard,selectedLatency:distribution(selected.map(x=>x.elapsedMs)),setup:{...setupMeter.summary(),elapsedMs:setupMs},correctness:{status:'PASS',relevantRecall:1,rank:1},
    comparison:'Discovery guard: same top-1 lexical query, legacy full-record envelope vs facade abstract. Complete answer comparison additionally includes every selected expansion call.',
    diagnosis:guard.status==='FAIL'?'Facade validates current scope/visibility and semantic digests across canonical records, projects bounded DTOs and writes exposure ledger; legacy and facade have different integrity/receipt work. This benchmark does not isolate each cost.':'No provisional latency regression measured in this sample'});
  const rebuildMeter=new Meter();await rm(path.join(dir,'index'),{recursive:true,force:true});
  const rebuild=await timed(()=>rebuildMeter.call('reindex',()=>service.reindex()));
  const afterReads=await storage(dir);results.storage.push({count,empty,beforeReads,afterReads,incrementalBytesPerRecord:(beforeReads.totalBytes-empty.totalBytes)/count,setupMs,indexRebuild:{...rebuildMeter.summary(),elapsedMs:rebuild.elapsedMs,note:'Derived index directory deleted in owned synthetic root; rebuild is excluded from warm samples'},note:'Real public batch writes in chunks <=100; initial snapshots, not a steady-state revision-growth claim'});
},process.platform==='win32'?900000:240000);

// Supplementary bound from section 12: links have no count cap; each legacy link
// has a 16-evidence-reference cap. Exercise all 16 plus a 65-link retained record.
test('maximum link evidence references and 65 distinct links survive canonical reload and selected paging',async()=>{
  const dir=await root(),service=await initializeMemoryRoot({baseDir:dir,memoryRoot:dir,experience:{enabled:true}});
  await service.batch(Array.from({length:66},(_,i)=>({op:'remember',id:'link-bound-'+i,value:{content:'Synthetic link bound '+i,provenance:{workspace:'agent-core',files:[]}}})));
  const evidenceRefs=Array.from({length:16},(_,i)=>'synthetic-evidence-'+i);
  const links=Array.from({length:65},(_,i)=>({targetId:'link-bound-'+(i+1),type:'related',strength:1,createdAt:'2026-10-07T00:00:00Z',evidenceRefs}));
  await service.update('link-bound-0',{links:links as any});
  const restarted=await MemoryService.initialize(dir,dir),record=(await restarted.read('link-bound-0',false))!;
  expect(record.links).toHaveLength(65);for(const link of record.links)expect(link.evidenceRefs).toEqual(evidenceRefs);
  const {memorySemanticRevision}=await import('../../../src/memory/disclosure.js');
  const meter=new Meter(),controller=restarted.controller({workspaceKey:'agent-core',taskId:'link-bound',controllerId:'fresh'});
  const selected=JSON.parse(await meter.expand(controller,{kind:'memory',id:record.id,revision:memorySemanticRevision(record)},'record',8192));
  expect(selected.links).toEqual(record.links);expect(meter.calls).toBeGreaterThan(1);
  results.supplementalLinkBound={status:'PASS',links:65,evidenceRefsPerLink:16,...meter.summary()};
},30000);
