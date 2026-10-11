import {isDeepStrictEqual as equal} from 'node:util';
import {episodePersistenceSchemas} from '../../SubProject/agent-core-memory/dist/memory/episodes.js';
import {v2MetadataSchema} from '../../SubProject/agent-core-memory/dist/memory/note-format.js';
import {memoryFeedbackContentDigest} from '../../SubProject/agent-core-memory/dist/memory/feedback-target.js';
import {promotionEpistemicRefs} from '../../SubProject/agent-core-memory/dist/memory/promotion.js';
import {memorySemanticRevision} from '../../SubProject/agent-core-memory/dist/memory/disclosure.js';
import {verifyOutcomeOracle} from './outcome-verifier.js';
import {outcomeDigest,parseOutcomeSuite} from './outcome-contract.js';
import {diagnosticObservationSchema,parseOutcomeDiagnostics,validateDiagnosticCase,type DiagnosticCase,type DiagnosticObservation,type DiagnosticDimension,type DiagnosticScores,type IntegrityScores} from './outcome-diagnostics.js';

const json=(data:Uint8Array)=>JSON.parse(Buffer.from(data).toString('utf8'));
const unknown=():DiagnosticDimension=>({status:'UNKNOWN',evidenceRefs:[]});
const dim=(pass:boolean,refs:string[]):DiagnosticDimension=>({status:pass?'PASS':'FAIL',evidenceRefs:refs});
const exactRef=(ref:string)=>/^diagnostic:(evidence\/diagnostics\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json)#(sha256:[a-f0-9]{64})$/.exec(ref);
function resolve(ref:string,evidence:ReadonlyMap<string,Uint8Array>):any{
 const match=exactRef(ref);if(!match)throw Error('unsafe-diagnostic-reference');const data=evidence.get(match[1]!);
 if(!data)throw Error('missing-diagnostic-evidence:'+match[1]);if(outcomeDigest(Buffer.from(data).toString())!==match[2])throw Error('diagnostic-evidence-digest-mismatch');return json(data);
}
function assertState(spec:DiagnosticCase,state:any,row?:DiagnosticObservation):void{
 if(state?.version!=='memory-diagnostic-state/v1'||!Array.isArray(state.records)||!Array.isArray(state.captured)||!Array.isArray(state.retrieved)||!Array.isArray(state.support)||!Number.isInteger(state.afterStep)||state.afterStep<0||state.afterStep>=spec.steps.length)throw Error('invalid-diagnostic-state');
 if(row&&(state.runId!==row.runId||state.taskId!==row.taskId))throw Error('snapshot-run-mismatch');
 const steps=spec.steps.slice(0,state.afterStep+1),captures=steps.filter(s=>s.kind==='capture');
 if(captures.length!==state.captured.length||new Set(state.captured.map((v:any)=>v.id)).size!==state.captured.length)throw Error('capture-membership-mismatch');
 if(state.records.length>64||new Set(state.records.map((r:any)=>r.ref.id)).size!==state.records.length)throw Error('record-membership-mismatch');
 for(const source of state.captured){const step=captures.find(s=>s.id===source.id);if(!step||!equal(source.body,{id:step.id,value:step.value,sourceId:step.sourceId})||source.sourceId!==step.sourceId||source.trust!==step.trust||source.source?.kind!=='artifact'||!/^sha256:[a-f0-9]{64}$/.test(source.source.revision))throw Error('capture-source-mismatch');}
 for(const item of state.records){
  const {record,ref}=item;v2MetadataSchema.parse(record);const capture=captures.find(s=>s.id===ref?.id),source=state.captured.find((s:any)=>s.id===ref?.id);
  if(!record||!capture||!source||record.version!==2||record.id!==ref.memoryId||record.provenance?.workspace!=='agent-core'||record.id===state.scopeSentinelId)throw Error('record-scope-mismatch');
  if(!equal(JSON.parse(record.content),source.body)||ref.sourceId!==capture.sourceId||ref.revision!==memorySemanticRevision(record)||ref.digest!==outcomeDigest(record))throw Error('record-revision-source-mismatch');
  const corrections=captures.filter(s=>s.supersedes===capture.id&&s.trust==='verified-fixture');const expectedFrom=new Date(capture.effectiveAt).toISOString(),expectedTo=corrections[0]?new Date(corrections[0].effectiveAt).toISOString():null;
  if(record.experience.validity.state!=='known'||record.experience.validity.from?.value!==expectedFrom||(record.experience.validity.to?.value??null)!==expectedTo)throw Error('record-validity-source-mismatch');
  if(!record.experience?.sourceRefs.some((s:any)=>equal(s,source.source)))throw Error('record-source-lineage-missing');
  if(record.experience.verification.status!=='unverified'||record.experience.epistemic!==(capture.trust==='verified-fixture'?'fact':'hypothesis'))throw Error('forbidden-trust-promotion');
 }
 const at=Date.parse(state.observedAt);if(!Number.isFinite(at))throw Error('snapshot-time-invalid');
 const current=state.records.filter(({record:r}:any)=>{const v=r.experience.validity;return r.experience.epistemic==='fact'&&v.state==='known'&&(!v.from||Date.parse(v.from.value)<=at)&&(!v.to||Date.parse(v.to.value)>at);}).map((r:any)=>r.ref.id);
 const historical=state.records.filter(({record:r}:any)=>r.experience.validity.to?.precision==='instant'&&Date.parse(r.experience.validity.to.value)<=at).map((r:any)=>r.ref.id);
 if(!equal(state.currentIds,current)||!equal(state.historicalIds,historical))throw Error('snapshot-temporal-projection-mismatch');
 for(const entry of state.support){const tasks=entry.procedure?.supportTaskIds;if(!Array.isArray(tasks)||new Set(tasks).size!==tasks.length||tasks.some((task:any)=>task!==state.runId)||tasks.length>0&&!entry.procedure.evidenceRefs?.length||!equal(entry.supportTaskIds,tasks)||entry.independentTaskCount!==tasks.length||entry.procedure.name!=='Diagnostic '+entry.candidateId)throw Error('support-count-mismatch');}
 for(const r of state.retrieval??[]){const value=JSON.parse(r.record.content);if(!equal(r.ref,{id:value.id,memoryId:r.record.id,revision:memorySemanticRevision(r.record),sourceId:value.sourceId,digest:outcomeDigest(r.record)})||r.hit.id!==r.ref.memoryId||r.hit.revision!==r.ref.revision||!state.records.some((s:any)=>s.ref.id===r.ref.id&&s.ref.revision===r.ref.revision))throw Error('retrieval-provenance-mismatch');}
 if(!equal(state.retrieved,(state.retrieval??[]).map((r:any)=>r.ref)))throw Error('retrieval-projection-mismatch');
}
function verifyPromotion(receipt:any,audit:any,taskId:string,memoryRef?:{memoryId:string;revision:string}){
 if(!receipt||!Array.isArray(receipt.canonicalRefs)||!receipt.auditRef||!Number.isInteger(receipt.episodeRevision)||!audit||!equal(audit.source,receipt.auditRef)||audit.availability!=='available'||outcomeDigest(audit.text+'\n')!==receipt.auditRef.revision)throw Error('diagnostic-promotion-proof-missing');
 const manifest=JSON.parse(audit.text);promotionEpistemicRefs(manifest);
 if(manifest.details?.owner?.taskId!==taskId||manifest.details.owner.workspaceKey!=='agent-core'||manifest.details.planId!==receipt.planId||!equal(manifest.details.canonicalRefs,receipt.canonicalRefs)||memoryRef&&!receipt.canonicalRefs.some((r:any)=>r.kind==='memory'&&r.id===memoryRef.memoryId&&r.revision===memoryRef.revision))throw Error('diagnostic-promotion-proof-mismatch');
}
export function verifyIntegrityCheckpoints(spec:DiagnosticCase,evidence:ReadonlyMap<string,Uint8Array>):{verdict:'pass'|'fail';reasons:string[];scores:IntegrityScores;complete:boolean}{
 const reasons:string[]=[],names=['stability','validUpdate','history','sourceFidelity','supportDeduplication'] as const;
 const scores=Object.fromEntries(names.map(n=>[n,unknown()])) as unknown as IntegrityScores;
 if(!spec.integrity)return{verdict:'pass',reasons,scores,complete:true};
 let missing=false;const checks=Object.fromEntries(names.map(n=>[n,{pass:true,refs:[] as string[]}])) as Record<typeof names[number],{pass:boolean;refs:string[]}>;
 for(const checkpoint of spec.integrity.checkpoints){
  const matches=[...evidence].filter(([name])=>name.endsWith('/step-'+checkpoint.afterStep+'.json'));
  if(matches.length!==1){missing=true;reasons.push('missing-integrity-checkpoint:'+checkpoint.afterStep);continue;}
  const [name,data]=matches[0]!,ref='diagnostic:'+name+'#'+outcomeDigest(Buffer.from(data).toString());let state:any;
  try{state=json(data);assertState(spec,state);if(state.afterStep!==checkpoint.afterStep)throw Error('checkpoint-step-mismatch');}catch(error){reasons.push((error as Error).message);for(const n of names){checks[n].pass=false;checks[n].refs.push(ref);}continue;}
  const test=(name:typeof names[number],pass:boolean)=>{checks[name].refs.push(ref);checks[name].pass&&=pass;if(!pass)reasons.push('integrity-'+name+':'+checkpoint.afterStep);};
  test('stability',checkpoint.expectedCurrentIds.every(id=>state.currentIds.includes(id))&&checkpoint.forbiddenPromotions.every(id=>!state.records.some((r:any)=>r.ref.id===id&&r.record.experience.epistemic==='fact')));
  test('validUpdate',checkpoint.expectedCurrentIds.every(id=>state.currentIds.includes(id)));
  test('history',checkpoint.expectedHistoricalIds.every(id=>state.historicalIds.includes(id)));
  test('sourceFidelity',checkpoint.expectedSources.every(expected=>{const record=state.records.find((r:any)=>r.ref.id===expected.id);if(!record)return false;return expected.sourceIds.every(sourceId=>state.captured.some((capture:any)=>capture.sourceId===sourceId&&record.record.experience.sourceRefs.some((ref:any)=>equal(ref,capture.source))));}));
  test('supportDeduplication',checkpoint.expectedSupport.every(expected=>{const support=state.support.find((s:any)=>s.candidateId===expected.candidateId);return (support?.independentTaskCount??0)===expected.independentTaskCount;}));
 }
 for(const name of names)scores[name]=missing?unknown():dim(checks[name].pass,checks[name].refs);
 return{verdict:reasons.length?'fail':'pass',reasons,scores,complete:!missing};
}
/** Oracle replay is separate from the scoring implementation; no model, fixture code, or scorer executes here. */
export function verifyDiagnosticEvidence(specBytes:Uint8Array,rowBytes:Uint8Array,evidence:ReadonlyMap<string,Uint8Array>){
 const reasons:string[]=[],scores:DiagnosticScores={preservation:unknown(),retrieval:unknown(),controllerUse:unknown(),outcome:unknown()};let complete=true;
 let integrity:ReturnType<typeof verifyIntegrityCheckpoints>|undefined;
 try{
  const spec=validateDiagnosticCase(json(specBytes)),row=diagnosticObservationSchema.parse(json(rowBytes));
  if(row.caseId!==spec.caseId||row.runId.split(':')[0]!==spec.caseId||row.taskId!==row.runId+':diagnostic')throw Error('diagnostic-run-identity-mismatch');
  if(new Set(row.evidenceRefs).size!==row.evidenceRefs.length)throw Error('duplicate-diagnostic-evidence');
  const prefix='evidence/diagnostics/'+row.runId.replaceAll(':','-')+'/';
  const resolved=new Map<string,any>();
  for(const ref of row.evidenceRefs){const match=exactRef(ref);if(!match?.[1]?.startsWith(prefix))throw Error('diagnostic-cross-run-evidence');resolved.set(match[1],resolve(ref,evidence));}
  const get=(name:string)=>{const value=resolved.get(prefix+name+'.json');if(!value)throw Error('missing-diagnostic-'+name);return value;};
  const trace=get('trace'),final=get('final'),answer=get('answer');
  if(!equal(trace.receiptRefs,row.useReceiptRefs)||trace.answerRef!==row.evidenceRefs.find(ref=>ref.startsWith('diagnostic:'+prefix+'answer.json#')))throw Error('diagnostic-final-evidence-binding');
  for(const name of ['capture','persist','answer','verification','review'])if(trace.lifecycle?.[name]!==true)throw Error('diagnostic-lifecycle-incomplete');
  if(trace.lifecycle.reopen!==spec.steps.some(s=>s.kind==='reopen')||trace.lifecycle.recall!==spec.steps.some(s=>s.kind==='recall')||trace.lifecycle.receipt!==(row.useReceiptRefs.length>0)||trace.learningReview?.taskId!==row.taskId||trace.learningReview?.complete!==true||!Object.values(trace.learningReview.checkpointDecisions??{}).length||Object.values(trace.learningReview.checkpointDecisions).some((decision:any)=>decision.taskId!==row.taskId||decision.complete!==true))throw Error('diagnostic-review-incomplete');
  if(trace.version!=='memory-diagnostic-trace/v1'||trace.runId!==row.runId||trace.caseId!==row.caseId||trace.stepsDigest!==outcomeDigest(spec.steps)||row.traceDigest!==outcomeDigest(trace)||trace.operations.length!==spec.steps.length||trace.inferenceCalls!==0||trace.grantChanges!==0)throw Error('diagnostic-trace-binding-mismatch');
  for(let i=0;i<spec.steps.length;i++){
   const operation=trace.operations[i];if(operation.step!==i||operation.kind!==spec.steps[i]!.kind||operation.status!=='success')throw Error('diagnostic-step-failed:'+i);
   const snapshot=get('step-'+i);assertState(spec,snapshot,row);const step=spec.steps[i]!;
   const previous=i?get('step-'+(i-1)):null;
   if(step.kind!=='recall'&&(!equal(snapshot.retrieved,previous?.retrieved??[])||!equal(snapshot.retrieval,previous?.retrieval??[])))throw Error('diagnostic-retrieval-continuity-mismatch');
   if(step.kind==='answer'){
    const recall=spec.steps.slice(0,i).reverse().find(s=>s.kind==='recall');
    const facts=snapshot.retrieval.filter((entry:any)=>entry.record.experience.epistemic==='fact'&&(step.answerMode==='historical'?Boolean(recall?.asOf):!recall?.asOf)).map((entry:any)=>JSON.parse(entry.record.content)).sort((a:any,b:any)=>a.id.localeCompare(b.id));
    const replayed=step.answerMode==='abstain'?{kind:'abstain'}:{kind:'facts',facts};
    if(!equal(operation.answer,replayed))throw Error('diagnostic-answer-does-not-replay');
   }
   if(step.kind==='review-consolidation'&&step.decision==='accept-verified'){
    const proof=operation.supportProof,decision=operation.supportDecision,prior=previous?.support.find((entry:any)=>entry.candidateId===step.candidateId),entry=snapshot.support.find((entry:any)=>entry.candidateId===step.candidateId);
    if(!proof||!decision||!entry||!equal(entry.procedure,decision))throw Error('diagnostic-support-proof-missing');
    const checked=verifyOutcomeOracle(proof.oracle,proof.artifactText),report=proof.report;
    if(report?.taskId!==row.runId||report.case?.digest!==outcomeDigest(proof.oracle)||report.answer?.digest!==outcomeDigest(proof.artifactText)||report.verifierRevision!=='agent-core-controlled-workflow/v2-declarative'||report.verdict!==checked.verdict||report.unsupportedClaims!==checked.unsupportedClaims)throw Error('diagnostic-support-proof-mismatch');
    const evidenceRef='verification:'+proof.reportPath+'#'+outcomeDigest(report),hasEvidence=step.taskEvidenceIds.includes('task-verification');
    const expectedEvidence=[...new Set([...(prior?.procedure.evidenceRefs??[]),...(hasEvidence?[evidenceRef]:[])])];
    const expectedTasks=[...new Set([...(prior?.supportTaskIds??[]),...(hasEvidence&&checked.verdict==='pass'?[row.runId]:[])])];
    if(!equal(decision.evidenceRefs,expectedEvidence)||!equal(entry.supportTaskIds,expectedTasks)||decision.workspace!=='agent-core'||decision.status!=='candidate'||!equal(decision.allowedTools,[])||!equal(decision.origins,[row.runId.split(':')[1]])||!equal(snapshot.support.filter((e:any)=>e.candidateId!==step.candidateId),previous?.support.filter((e:any)=>e.candidateId!==step.candidateId)??[]))throw Error('diagnostic-support-provenance-mismatch');
   }else if(!equal(snapshot.support,previous?.support??[]))throw Error('diagnostic-support-continuity-mismatch');
   if(step.kind==='capture'){
    const source=snapshot.captured.find((c:any)=>c.id===step.id),capture=operation.captureReceipt,artifact=operation.capturedArtifact;
    if(!capture||capture.availability!=='available'||capture.bytes!==Buffer.byteLength(JSON.stringify(source.body))||!equal(capture.source,source.source)||!artifact||!equal(artifact.source,source.source)||outcomeDigest(artifact.text)!==source.source.revision)throw Error('diagnostic-capture-proof-missing');
    const manifest=episodePersistenceSchemas.artifact.parse(JSON.parse(artifact.text));
    if(manifest.owner.taskId!==row.taskId||manifest.owner.workspaceKey!=='agent-core'||manifest.id!==source.source.id||manifest.availability!=='available'||manifest.bodyDigest!==outcomeDigest(source.body)||manifest.bytes!==capture.bytes||manifest.origin.kind!=='controller-text'||manifest.origin.originRef!=='synthetic:'+step.sourceId)throw Error('diagnostic-capture-proof-mismatch');
    const canonical=snapshot.records.find((r:any)=>r.ref.id===step.id);
    verifyPromotion(operation.ownerReceipt,operation.promotionAudit,row.taskId,step.supersedes&&step.trust==='verified-fixture'?undefined:canonical.ref);
    if(step.supersedes&&step.trust==='verified-fixture'){verifyPromotion(operation.transitionReceipt,operation.transitionAudit,row.taskId,canonical.ref);verifyPromotion(operation.transitionReceipt,operation.transitionAudit,row.taskId,snapshot.records.find((r:any)=>r.ref.id===step.supersedes).ref);}
   }else if(step.kind==='reopen'){if(!operation.restoredContext?.episode||operation.restoredContext.episode.taskId!==row.taskId||operation.restoredEpisodeId!==operation.restoredContext.episode.id||operation.restoredContext.episodeRef?.id!==operation.restoredEpisodeId)throw Error('diagnostic-reopen-proof-missing');}
   else if(step.kind==='recall'){const off=row.runId.endsWith(':off');if(off?snapshot.retrieved.length!==0:!Array.isArray(operation.recall?.data?.hits))throw Error('diagnostic-recall-proof-missing');if(!off){const selectedHits=operation.recall.data.hits.filter((hit:any)=>snapshot.records.some((r:any)=>r.ref.memoryId===hit.id));if(!equal(selectedHits,snapshot.retrieval.map((r:any)=>r.hit)))throw Error('diagnostic-recall-binding');}}
   else if(step.kind==='review-consolidation'&&step.decision==='accept-verified')verifyPromotion(operation.ownerReceipt,operation.promotionAudit,row.taskId);
   if(i&&step.kind!=='capture'){const previous=get('step-'+(i-1));if(!equal(previous.records,snapshot.records)||!equal(previous.captured,snapshot.captured))throw Error('diagnostic-state-continuity-mismatch');}
   if(i&&step.kind==='capture'){const previous=get('step-'+(i-1));for(const prior of previous.records){const next=snapshot.records.find((r:any)=>r.ref.id===prior.ref.id);if(!next||prior.ref.id!==step.supersedes&&!equal(next,prior))throw Error('diagnostic-state-continuity-mismatch');}}if(snapshot.afterStep!==i||operation.evidenceRef!==row.evidenceRefs.find(ref=>ref.startsWith('diagnostic:'+prefix+'step-'+i+'.json#')))throw Error('diagnostic-step-binding-mismatch');
   if((operation.recall?.data?.hits??[]).some((hit:any)=>hit.id===snapshot.scopeSentinelId))throw Error('diagnostic-scope-leak');
  }
  const lastAnswer=[...trace.operations].reverse().find((op:any)=>op.kind==='answer');if(!lastAnswer||!equal(lastAnswer.answer,row.answer))throw Error('diagnostic-answer-driver-binding');
  assertState(spec,final,row);if(!equal(final,get('step-'+(spec.steps.length-1))))throw Error('diagnostic-final-state-mismatch');
  if(!equal(final.records.map((r:any)=>r.ref),row.preservedRefs)||!equal(final.retrieved,row.retrievedRefs)||!equal(answer.answer,row.answer)||answer.runId!==row.runId||answer.caseId!==row.caseId||answer.oracleDigest!==outcomeDigest(spec.oracle))throw Error('diagnostic-observation-projection-mismatch');
  const expected=spec.oracle,contains=(refs:any[],ids:string[])=>ids.every(id=>refs.some(ref=>ref.id===id))&&!expected.forbiddenIds.some(id=>refs.some(ref=>ref.id===id));
  scores.preservation=dim(contains(row.preservedRefs,expected.expectedPreservedIds),row.evidenceRefs);
  scores.retrieval=dim(contains(row.retrievedRefs,expected.expectedRetrievedIds)&&row.retrievedRefs.length===expected.expectedRetrievedIds.length,row.evidenceRefs);
  const passed=equal(answer.answer,expected.expectedAnswer);
  const mapAnswer=(value:any)=>value.kind==='facts'?value.facts.map((f:any)=>({key:f.id,value:f.value,source:f.sourceId,contradictions:[]})):[{key:'abstention',value:'insufficient-evidence',source:'synthetic-oracle',contradictions:[]}];
  const workflow=answer.workflow,expectedFacts=mapAnswer(expected.expectedAnswer).map(({contradictions,...f}:any)=>f);
  if(!workflow||!equal(workflow.oracle,{domain:'research',facts:expectedFacts})||workflow.artifactText!==JSON.stringify(mapAnswer(row.answer))||workflow.report?.taskId!==row.taskId||workflow.report.case?.digest!==outcomeDigest(workflow.oracle)||workflow.report.answer?.digest!==outcomeDigest(workflow.artifactText)||workflow.report.verdict!==(passed?'pass':'fail')||workflow.report.verifierRevision!=='agent-core-controlled-workflow/v2-declarative')throw Error('diagnostic-workflow-proof-mismatch');if(answer.verdict!==(passed?'pass':'fail'))throw Error('diagnostic-oracle-verdict-mismatch');
  scores.outcome=dim(passed,row.evidenceRefs);
  if(row.useReceiptRefs.length){let valid=true;for(const ref of row.useReceiptRefs){if(!row.evidenceRefs.includes(ref))throw Error('unbound-diagnostic-receipt');const receipt=resolve(ref,evidence),hit=row.retrievedRefs.find(h=>h.memoryId===receipt.memoryId&&h.revision===receipt.revision);valid&&=Boolean(hit&&receipt.taskId===row.taskId&&receipt.actionDigest===outcomeDigest(row.answer)&&receipt.verdict==='pass'&&receipt.ownerReceipt?.taskId===row.taskId&&receipt.ownerReceipt?.memoryId===receipt.memoryId&&receipt.ownerReceipt?.evidenceValidation==='resolved'&&receipt.ownerReceipt?.applicability==='applied'&&receipt.ownerReceipt?.result==='success');const retrieved=final.retrieval.find((r:any)=>r.ref.memoryId===receipt.memoryId&&r.ref.revision===receipt.revision);if(!retrieved||receipt.ownerReceipt.contentDigest!==memoryFeedbackContentDigest(retrieved.record)||receipt.ownerReceipt.retrievalAttemptId!==retrieved.hit.retrievalEvidence?.attemptId||!equal(receipt.ownerReceipt.actionRefs,['file:'+workflow.report.answer.path+'#'+workflow.report.answer.digest])||receipt.ownerReceipt.verificationRef!=='verification:'+workflow.reportPath+'#'+outcomeDigest(workflow.report)||receipt.ownerReceipt.workspace!=='agent-core'||receipt.ownerReceipt.version!==1||receipt.ownerReceipt.useId!==row.runId+':diagnostic:'+retrieved.ref.id)throw Error('diagnostic-use-proof-mismatch');}scores.controllerUse=dim(valid,row.useReceiptRefs);}
  integrity=spec.integrity?verifyIntegrityCheckpoints(spec,new Map([...evidence].filter(([name])=>name.startsWith(prefix)))):undefined;complete&&=integrity?.complete??true;
  if(integrity?.verdict==='fail')reasons.push(...integrity.reasons);
 }catch(error){reasons.push((error as Error).message);complete=false;}
 return{verdict:reasons.length?'fail' as const:'pass' as const,reasons,scores,integrity:integrity?.scores??null,complete};
}
export function verifyDiagnosticReport(suiteBytes:Uint8Array,sidecarBytes:Uint8Array,rowBytes:Uint8Array,report:any,evidence:ReadonlyMap<string,Uint8Array>){
 const reasons:string[]=[];
 try{
  const suite=parseOutcomeSuite(json(suiteBytes)),sidecar=parseOutcomeDiagnostics(json(sidecarBytes),suite),rows=json(rowBytes) as DiagnosticObservation[];
  if(!['baseline','compare'].includes(report.phase))throw Error('invalid-diagnostic-phase');
  const expected=suite.expectedRunIds[report.phase as 'baseline'|'compare'];const seen=new Set<string>(),runs:any[]=[];
  for(const row of rows){if(seen.has(row.runId)||!expected.includes(row.runId))reasons.push('duplicate-or-foreign-diagnostic-run');seen.add(row.runId);const spec=sidecar.cases.find(c=>c.caseId===row.caseId);if(!spec)throw Error('foreign-diagnostic-case');const result=verifyDiagnosticEvidence(Buffer.from(JSON.stringify(spec)),Buffer.from(JSON.stringify(row)),evidence);if(!result.complete)reasons.push(...result.reasons);runs.push({runId:row.runId,diagnosticFamily:spec.diagnosticFamily,scores:result.scores,integrity:result.integrity,complete:result.complete,reasons:result.reasons});}
  const missing=expected.filter(id=>!seen.has(id));
  const complete=missing.length===0&&rows.length===expected.length&&runs.every(r=>r.complete);
  const hardFailure=runs.some(r=>r.reasons.length||r.integrity&&Object.values(r.integrity).some((v:any)=>v.status!=='PASS'));
  const reconstructed={version:'memory-diagnostic-report/v1',phase:report.phase,suiteDigest:outcomeDigest(suite),sidecarDigest:outcomeDigest(sidecar),observationsDigest:outcomeDigest(rows),expectedRunIds:expected,missingRunIds:missing,complete,integrityStatus:hardFailure?'FAIL':complete?'PASS':'UNKNOWN',runs,benefitProven:false,efficiencyBenchmark:'DEFERRED',live:'NOT RUN'};
  if(!equal(report,reconstructed))reasons.push('diagnostic-report-does-not-reproduce');
 }catch(error){reasons.push((error as Error).message);}
 return{verdict:reasons.length?'fail' as const:'pass' as const,reasons};
}
