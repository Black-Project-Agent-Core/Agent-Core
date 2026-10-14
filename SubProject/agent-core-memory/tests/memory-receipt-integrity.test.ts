import {afterEach,expect,test} from 'vitest';
import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {MemoryRetrievalLedger,memoryRecordFingerprint} from '../src/memory/retrieval-ledger.js';
import {memoryFeedbackContentDigest} from '../src/memory/feedback-target.js';
import {resolveMemoryPaths} from '../src/memory/paths.js';
import {setup,cleanup} from './helpers/memory-capsule.js';
afterEach(cleanup);
test('E28 over-limit attempt and receipt rotation preserves replay binding after restart and index rebuild',async()=>{
 const{service,dir}=await setup();const record=await service.remember({content:'Retained receipt subject',provenance:{workspace:'agent-core',files:[]}}),paths=resolveMemoryPaths(dir,dir),ledger=new MemoryRetrievalLedger(paths),digest=memoryFeedbackContentDigest(record),now=new Date().toISOString();
 const attempt:any={version:1,attemptId:'retained-attempt',taskId:'task-race',workspace:'agent-core',surface:'memory_recall',trigger:'explicit',startedAt:now,completedAt:now,retrievalStatus:'succeeded',deliveryStatus:'returned-to-controller',candidateCount:1,selectedCount:1,disclosureView:'abstract',payloadBytes:400,payloadDigest:'sha256:'+'a'.repeat(64),exposures:[{memoryId:record.id,rank:1,disposition:'trimmed',handoffStatus:'returned-to-controller',recordFingerprint:memoryRecordFingerprint(record.id,record.updatedAt),contentDigest:digest}]};
 await ledger.record(attempt);
 const input:any={useId:'retained-use',retrievalAttemptId:attempt.attemptId,taskId:'task-race',workspace:'agent-core',memoryId:record.id,contentDigest:digest,applicability:'applied',result:'unavailable',reasonCode:'controller-reported'};
 const first=await ledger.recordUseReceipt(input,digest);
 // Seed genuine normalized rows at the documented bound, then exercise each real rotation writer.
 await writeFile(path.join(paths.state,'retrieval-ledger.jsonl'),Array.from({length:4000},(_,i)=>JSON.stringify({...attempt,attemptId:i?'fill-'+i:attempt.attemptId})).join('\n')+'\n');
 await writeFile(path.join(paths.state,'retrieval-use-receipts.jsonl'),Array.from({length:4000},(_,i)=>JSON.stringify({...first.receipt,useId:i?'fill-use-'+i:input.useId})).join('\n')+'\n');
 await ledger.record({...attempt,attemptId:'overflow-attempt'});await ledger.recordUseReceipt({...input,useId:'overflow-use',retrievalAttemptId:'overflow-attempt'},digest);
 expect((await readFile(path.join(paths.state,'retrieval-ledger.jsonl'),'utf8')).trim().split('\n')).toHaveLength(3000);
 expect((await readFile(path.join(paths.state,'retrieval-use-receipts.jsonl'),'utf8')).trim().split('\n')).toHaveLength(3000);
 await rm(paths.index,{recursive:true,force:true});await service.reindex();
 const restarted=new MemoryRetrievalLedger(paths);expect(await restarted.recordUseReceipt(input,digest)).toEqual({...first,duplicate:true});
 expect((await restarted.recordUseReceipt({...input,useId:'fill-use-1'},digest)).duplicate).toBe(true);
 expect((await restarted.record({...attempt,attemptId:'fill-1'})).duplicate).toBe(true);
 await expect(restarted.recordUseReceipt({...input,reasonCode:'different'},digest)).rejects.toThrow('MEMORY_USE_RECEIPT_CONFLICT');
 await expect(restarted.recordUseReceipt({...input,workspace:'other'},digest)).rejects.toThrow();
 expect(await restarted.record(attempt)).toEqual({duplicate:true,attempt});
 await rm(path.join(paths.state,'retrieval-ledger.jsonl'));await rm(path.join(paths.state,'retrieval-use-receipts.jsonl'));
 const rebuilt=new MemoryRetrievalLedger(paths);expect(await rebuilt.recordUseReceipt(input,digest)).toEqual({...first,duplicate:true});expect(await rebuilt.record(attempt)).toEqual({duplicate:true,attempt});
},60000);
test('E26 byte availability, controller-reported use, rechecked outcome and causation stay distinct',async()=>{
 const{A,service,dir}=await setup();const record=await service.remember({content:'Synthetic reusable method',provenance:{workspace:'agent-core',files:[]}}),page:any=await A.recall({query:'reusable method'}),hit=page.data.hits.find((h:any)=>h.id===record.id);
 const input:any={useId:'use-boundary',retrievalAttemptId:hit.retrievalEvidence.attemptId,taskId:'task-race',workspace:'agent-core',memoryId:record.id,contentDigest:hit.retrievalEvidence.contentDigest,applicability:'applied',result:'unavailable',reasonCode:'controller-reported'};
 const noOutcome=await service.recordUseReceipt(input);expect(noOutcome.receipt).toMatchObject({result:'unavailable',evidenceValidation:'unavailable'});
 const{readEvidenceSnapshot}=await import('../src/verification/evidence-snapshot.js');const{resolveWorkflowEvidence,validateWorkflowUse}=await import('../src/learning/workflow-evidence.js');const{registerWorkflowVerification,WORKFLOW_VERIFIER_REVISION}=await import('../src/learning/workflow-verifier.js');
 const answer=path.join(dir,'answer.txt'),fixture=path.join(dir,'case.json'),report=path.join(dir,'report.json');await writeFile(answer,'x => x + 1');await writeFile(fixture,JSON.stringify({domain:'engineering',tests:[{input:2,expected:3}]}));
 const a=await readEvidenceSnapshot(answer),c=await readEvidenceSnapshot(fixture);await writeFile(report,JSON.stringify({taskId:'task-race',verifierRevision:WORKFLOW_VERIFIER_REVISION,case:{path:fixture,digest:c.digest},answer:{path:answer,digest:a.digest}}));
 const r=await readEvidenceSnapshot(report),verificationRef=`verification:${report}#${r.digest}`,actionRefs=[`file:${answer}#${a.digest}`];
 expect(await resolveWorkflowEvidence(actionRefs[0])).toMatchObject({status:'resolved',semanticSupport:'not-established'});
 const fabricated=await service.recordUseReceipt({...input,useId:'fabricated-use',result:'success',verificationRef,actionRefs});expect(fabricated.receipt.result).toBe('unavailable');
 registerWorkflowVerification({taskId:'task-race',case:{path:fixture,digest:c.digest},answerPath:answer});
 const unrelated=await service.recordUseReceipt({...input,useId:'unrelated-use',taskId:'task-race',result:'success',verificationRef,actionRefs:[`file:${fixture}#${c.digest}`]});expect(unrelated.receipt.result).toBe('unavailable');
 const{activityTracker}=await import('../src/tracker/activity-tracker.js');const unrelatedTool=activityTracker.record('TEST','info','Unrelated synthetic action','tool-call',{taskId:'task-race'});
 const toolOnly=await validateWorkflowUse({taskId:'task-race',verificationRef,actionRefs:['tool:'+unrelatedTool.id]});expect(toolOnly.status).toBe('unavailable');
 const verified=await service.recordUseReceipt({...input,useId:'verified-use',result:'success',verificationRef,actionRefs});expect(verified.receipt).toMatchObject({result:'success',evidenceValidation:'resolved'});
 const proof=await validateWorkflowUse({taskId:'task-race',verificationRef,actionRefs});expect(proof).toMatchObject({status:'resolved',verification:'pass',semanticSupport:'not-established',causation:'not-established',use:'controller-reported'});
 const ledger=new MemoryRetrievalLedger(resolveMemoryPaths(dir,dir)),diagnostics=ledger.diagnostics([],[]);expect(diagnostics.useEvidence).toMatchObject({receiptCount:4,associatedSuccess:1,outcomeUnavailable:3});expect(diagnostics.lifecycle.returnedToControllerExposures).toBeGreaterThan(0);
 await writeFile(answer,'x => x + 2');
 const{MemoryService}=await import('../src/index.js');const restarted=await MemoryService.initialize(dir,dir);
 expect(await restarted.recordUseReceipt({...input,useId:'verified-use',result:'success',verificationRef,actionRefs})).toEqual({...verified,duplicate:true});
 await expect(restarted.recordUseReceipt({...input,useId:'verified-use',result:'failure',verificationRef,actionRefs})).rejects.toThrow('MEMORY_USE_RECEIPT_CONFLICT');
 const changed=await service.recordUseReceipt({...input,useId:'changed-use',result:'success',verificationRef,actionRefs});expect(changed.receipt.result).toBe('unavailable');
});
test('episode and evidence exposure logs bind the actual final payload without claiming memory use',async()=>{
 const{A,dir}=await setup();const artifact=await A.captureEvidence({operationId:'exposure-source',source:{kind:'controller-text',text:'Available synthetic evidence'}});const expanded=await A.expand({source:artifact.source,view:'evidence'});
 const ledger=new MemoryRetrievalLedger(resolveMemoryPaths(dir,dir)),attempt=ledger.list().find(a=>a.disclosureView==='evidence');const{disclosurePayloadDigest}=await import('../src/memory/disclosure.js');
 expect(attempt).toMatchObject({surface:'memory_expand',retrievalStatus:'succeeded',payloadBytes:expanded.metrics.payloadBytes,payloadDigest:disclosurePayloadDigest(expanded),exposures:[]});expect(ledger.diagnostics([],[]).useEvidence.receiptCount).toBe(0);
});
test('retained attempt identity cannot be replaced by a conflicting recent exposure row',async()=>{
 const{A,service,dir}=await setup(),record=await service.remember({content:'Exposure identity fixture',provenance:{workspace:'agent-core',files:[]}}),page:any=await A.recall({query:'Exposure identity fixture'}),hit=page.data.hits.find((h:any)=>h.id===record.id),paths=resolveMemoryPaths(dir,dir),ledger=new MemoryRetrievalLedger(paths);
 const file=path.join(paths.state,'retrieval-ledger.jsonl'),rows=(await readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));rows.find(row=>row.attemptId===hit.retrievalEvidence.attemptId).payloadDigest='sha256:'+'f'.repeat(64);await writeFile(file,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
 await expect(service.recordUseReceipt({useId:'conflicting-telemetry',taskId:'task-race',workspace:'agent-core',retrievalAttemptId:hit.retrievalEvidence.attemptId,memoryId:record.id,contentDigest:hit.retrievalEvidence.contentDigest,applicability:'applied',result:'unavailable',reasonCode:'reported'})).rejects.toThrow('MEMORY_RETRIEVAL_ATTEMPT_CONFLICT');
});

test('retained ranked exposure compares score fields by meaning rather than insertion order',async()=>{
 const{service,dir}=await setup(),record=await service.remember({content:'Ranked receipt source',provenance:{workspace:'agent-core',files:[]}}),paths=resolveMemoryPaths(dir,dir),ledger=new MemoryRetrievalLedger(paths),digest=memoryFeedbackContentDigest(record),now=new Date().toISOString();
 const attempt:any={version:1,attemptId:'ordered-score-attempt',taskId:'task-race',workspace:'agent-core',surface:'memory_recall',trigger:'explicit',startedAt:now,completedAt:now,retrievalStatus:'succeeded',deliveryStatus:'returned-to-controller',candidateCount:1,selectedCount:1,exposures:[{memoryId:record.id,rank:1,disposition:'selected',handoffStatus:'returned-to-controller',recordFingerprint:memoryRecordFingerprint(record.id,record.updatedAt),contentDigest:digest,scoreSummary:{semantic:0.8,lexical:0.4}}]};
 await ledger.record(attempt);
 const receipt=await ledger.recordUseReceipt({useId:'ordered-score-use',retrievalAttemptId:attempt.attemptId,taskId:'task-race',workspace:'agent-core',memoryId:record.id,contentDigest:digest,applicability:'applied',result:'unavailable',reasonCode:'controller-reported'},digest);
 expect(receipt.duplicate).toBe(false);
 const reordered={...attempt,exposures:[{...attempt.exposures[0],scoreSummary:{lexical:0.4,semantic:0.8}}]};
 expect((await ledger.record(reordered)).duplicate).toBe(true);
 await expect(ledger.record({...reordered,exposures:[{...reordered.exposures[0],scoreSummary:{lexical:0.9,semantic:0.8}}]})).rejects.toThrow('MEMORY_RETRIEVAL_ATTEMPT_CONFLICT');
});
