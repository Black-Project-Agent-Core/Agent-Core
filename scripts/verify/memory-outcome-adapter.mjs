// Scripted, synthetic fixture adapter. No provider or host-config imports.
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {taskReviewDecision} from './cumulative-workflow-support.mjs';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const bytes=value=>JSON.stringify(value);
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes(value),{flag:'wx',mode:0o600});};
// Module-level telemetry singletons bind at import time. Serialize the scoped
// environment override so concurrent fixture imports cannot select each other's
// project identity. Cached telemetry remains in the first isolated fixture root,
// never in immutable snapshot input or the checkout's runtime.
let ownerImportQueue=Promise.resolve();
async function importOwners(snapshotRoot,fixtureRoot){
 let release;const previous=ownerImportQueue;ownerImportQueue=new Promise(resolve=>{release=resolve;});await previous;
 const prior=process.env.AGENT_CORE_PROJECT_ROOT;
 try{
  process.env.AGENT_CORE_PROJECT_ROOT=fixtureRoot;
  const modules={};for(const [key,relative] of Object.entries({host:'dist/memory/host-runtime.js',owner:'SubProject/agent-core-memory/dist/index.js',workflow:'dist/learning/workflow-verifier.js',memoryWorkflow:'SubProject/agent-core-memory/dist/learning/workflow-verifier.js',retrievalOwner:'SubProject/agent-core-memory/dist/memory/retrieval.js',learningOwner:'dist/learning/service.js'}))modules[key]=await import(pathToFileURL(path.join(snapshotRoot,relative)).href);
  return modules;
 }finally{if(prior===undefined)delete process.env.AGENT_CORE_PROJECT_ROOT;else process.env.AGENT_CORE_PROJECT_ROOT=prior;release();}
}
export class OutcomeMemoryAdapter{
 async initialize(root,seed,config){
  if(config.engineMode!=='experience-v2'||config.activation!=='synthetic-v2')throw Error('BLOCKED:V2_REQUIRED');
  this.safeEngineering=await import(new URL('../../dist/learning/outcome-safe-engineering.js',import.meta.url).href);
  this.root=root;this.config=config;await fs.mkdir(root,{recursive:false});
  await save(path.join(root,'package.json'),{private:true,type:'module',name:'synthetic-memory-outcome-fixture'});
  Object.assign(this,await importOwners(config.snapshotRoot,path.resolve(root)));
  await this.owner.initializeStandaloneMemory({baseDir:root,memoryRoot:path.join(root,'runtime/memory-v2'),experience:{enabled:true}});
  const marker={schemaVersion:1,mode:'experience-v2',root:'runtime/memory-v2',backup:'runtime/backups/memory-v1-final-before-v2-20261008/manifest.json',legacyDigest:'a'.repeat(64)};
  await save(path.join(root,marker.backup),{snapshotDigest:marker.legacyDigest,fileCount:2});
  await save(path.join(root,'runtime/memory-v2-activation.json'),marker);this.activationDigest=hash(bytes(marker));
  await this.reopen();
  await fs.writeFile(path.join(root,'seed-evidence.txt'),seed.content,{flag:'wx'});
  this.note=await this.runtime.experience.remember({title:'Synthetic task-scoped seed',content:seed.content,category:'lesson',provenance:{workspace:'agent-core',files:['seed-evidence.txt']}});
  // A foreign workspace record is deliberately present to exercise scope filtering.
  this.foreign=await this.runtime.experience.remember({title:'Neighbor sentinel',content:'Foreign workspace synthetic secret SENTINEL_NEIGHBOR',provenance:{workspace:'neighbor-fixture',files:[]}});
 }
 async reopen(){
  const marker=path.join(this.root,'runtime/memory-v2-activation.json');try{await fs.access(marker);}catch(error){if(error.code==='ENOENT')throw Error('BLOCKED:ACTIVATION_REQUIRED');throw error;}
  this.runtime=await this.host.initializeAgentCoreMemory(this.root,path.join(this.root,'runtime/memory'));
  if(this.runtime.mode!=='experience-v2'||!this.runtime.experience)throw Error('BLOCKED:LEGACY_ENGINE_REFUSED');
  this.learning=await this.learningOwner.LearningService.initialize({enabled:true,stateDir:path.join(this.root,'runtime/learning'),reviewInterval:10,curatorIntervalHours:168},this.runtime.experience);
 }
 session(taskId,controller){
  const session=this.runtime.experience.controller({workspaceKey:'agent-core',taskId,controllerId:'outcome-'+controller},this.config.policy);
  const caps=session.capabilities();if(caps.writeMode!=='experience-v2')throw Error('BLOCKED:LEGACY_RECALL_REFUSED');
  if(this.config.policy==='fusion-feedback-v1'){
   const factory=this.runtime.experience.controller.toString();
   if(!factory.includes("policy !== 'fusion-feedback-v1'")||!factory.includes("options.rankingProfile = 'fusion'")||!factory.includes('maxNeighbors: 0'))throw Error('BLOCKED:CANDIDATE_POLICY_UNAVAILABLE');
  }
  return session;
 }
 async checkpoint(taskId,evidenceRefs=[]){return this.learning.checkpoint({taskId,idempotencyKey:taskId+':final',meaningful:true,workspace:'agent-core',evidenceRefs});}
 async status(){return this.learning.status();}
 async review(taskId){await this.learning.review([],false,{taskId,checkpointKeys:[taskId+':final'],disposition:'no-new-knowledge'});return taskReviewDecision((await this.status()).state,taskId);}
 async close(){/* Owners use bounded transactions; no provider, timer or listener was opened. */}
 /** The driver receives operations only. Expected answers and integrity assertions stay here in the verifier host. */
 async executeDiagnostic(spec,context,diagnostic){
  const {validateDiagnosticCase}=await import(new URL('../../dist/learning/outcome-diagnostics.js',import.meta.url));
  validateDiagnosticCase(diagnostic);
  const base=await this.execute(spec,context);
  const result=await this.executeDiagnosticSteps(diagnostic.steps,context);
  const {answer,selected,trace,final,stepSnapshots}=result;
  // Host-only support proof, attached after the scripted sequence has finished.
  for(const operation of trace.operations)if(operation.supportDecision){const reportPath=path.join(this.root,'work/verification.json');operation.supportProof={oracle:spec.oracle,artifactText:base.artifactText,report:JSON.parse(await fs.readFile(reportPath,'utf8')),reportPath};}
  const expected=diagnostic.oracle.expectedAnswer;
  const verdict=bytes(answer)===bytes(expected)?'pass':'fail';
  const runId=context.runId,taskId=runId+':diagnostic',slug=runId.replaceAll(':','-'),prefix='evidence/diagnostics/'+slug;
  const evidence=new Map(),evidenceRefs=[];
  const publish=async(name,value)=>{const data=Buffer.from(bytes(value)),relative=prefix+'/'+name+'.json';evidence.set(relative,data);await save(path.join(context.output,relative),value);const ref='diagnostic:'+relative+'#'+hash(data);evidenceRefs.push(ref);return ref;};
  const mapped=answer.kind==='facts'?answer.facts.map(f=>({key:f.id,value:f.value,source:f.sourceId,contradictions:[]})):[{key:'abstention',value:'insufficient-evidence',source:'synthetic-oracle',contradictions:[]}];
  const expectedMapped=expected.kind==='facts'?expected.facts.map(f=>({key:f.id,value:f.value,source:f.sourceId})):[{key:'abstention',value:'insufficient-evidence',source:'synthetic-oracle'}];
  const oracle={domain:'research',facts:expectedMapped},work=path.join(this.root,'diagnostic-verification');await fs.mkdir(work);
  const oraclePath=path.join(work,'oracle.json'),answerPath=path.join(work,'answer.txt');await save(oraclePath,oracle);await fs.writeFile(answerPath,bytes(mapped),{flag:'wx'});
  const manifest={taskId,case:{path:oraclePath,digest:hash(bytes(oracle))},answerPath};
  this.workflow.registerWorkflowVerification(manifest);this.memoryWorkflow.registerWorkflowVerification(manifest);await this.learning.registerVerificationManifest(manifest);
  const verification=this.workflow.verifyWorkflowAnswer(oracle,bytes(mapped));
  const ownedReport={verifierRevision:this.workflow.WORKFLOW_VERIFIER_REVISION,taskId,case:manifest.case,answer:{path:answerPath,digest:hash(bytes(mapped))},...verification};
  const reportPath=path.join(work,'verification.json');await save(reportPath,ownedReport);
  const verificationRef='verification:'+reportPath+'#'+hash(bytes(ownedReport)),actionRef='file:'+answerPath+'#'+hash(bytes(mapped));
  const useReceiptRefs=[];
  for(const hit of selected){const fact=answer.kind==='facts'&&answer.facts.find(f=>f.id===hit.ref.id);if(!fact)continue;
   const recorded=await this.runtime.experience.recordUseReceipt({taskId,useId:runId+':diagnostic:'+hit.ref.id,memoryId:hit.ref.memoryId,contentDigest:hit.hit.retrievalEvidence.contentDigest,retrievalAttemptId:hit.hit.retrievalEvidence.attemptId,workspace:'agent-core',applicability:'applied',result:verification.verdict==='pass'?'success':'failure',reasonCode:'diagnostic-scripted-evidence-used',actionRefs:[actionRef],verificationRef});
   const ownerReceipt=recorded.receipt;
   useReceiptRefs.push(await publish('receipt-'+useReceiptRefs.length,{taskId,memoryId:hit.ref.memoryId,revision:hit.ref.revision,actionDigest:hash(bytes(answer)),verdict,ownerReceipt}));
  }
  const key=runId+':diagnostic-final';await this.learning.checkpoint({taskId,idempotencyKey:key,meaningful:true,workspace:'agent-core',evidenceRefs:[verificationRef]});
  await this.learning.review([],false,{taskId,checkpointKeys:[key],disposition:'no-new-knowledge'});
  const status=await this.learning.status();const decision=taskReviewDecision(status.state,taskId);
  const answerRef=await publish('answer',{caseId:diagnostic.caseId,runId,answer,oracleDigest:hash(bytes(diagnostic.oracle)),verdict,workflow:{oracle,artifactText:bytes(mapped),report:ownedReport,reportPath}});
  for(let i=0;i<stepSnapshots.length;i++){const ref=await publish('step-'+i,stepSnapshots[i]);trace.operations[i].evidenceRef=ref;}
  await publish('final',final);
  Object.assign(trace,{caseId:diagnostic.caseId,runId,stepsDigest:hash(bytes(diagnostic.steps)),answerRef,receiptRefs:useReceiptRefs,learningReview:decision,lifecycle:{capture:true,persist:true,reopen:diagnostic.steps.some(s=>s.kind==='reopen'),recall:diagnostic.steps.some(s=>s.kind==='recall'),answer:true,verification:true,receipt:useReceiptRefs.length>0,review:Boolean(decision?.complete)},inferenceCalls:0,grantChanges:0});
  const traceRef=await publish('trace',trace);
  return{base,diagnostic:{caseId:diagnostic.caseId,runId,taskId,traceDigest:traceRef.split('#')[1],preservedRefs:final.records.map(r=>r.ref),retrievedRefs:final.retrieved,useReceiptRefs,answer,evidenceRefs},evidence};
 }
 async executeDiagnosticSteps(steps,context){
  const disclosure=await import(pathToFileURL(path.join(this.config.snapshotRoot,'SubProject/agent-core-memory/dist/memory/disclosure.js')).href);
  const temporal=await import(pathToFileURL(path.join(this.config.snapshotRoot,'SubProject/agent-core-memory/dist/memory/temporal.js')).href);
  const taskId=context.runId+':diagnostic',byId=new Map(),captured=[],trace={version:'memory-diagnostic-trace/v1',operations:[]},stepSnapshots=[];
  let selected=[],answer={kind:'facts',facts:[]},lastAsOf;
  // Host review checks exact captured synthetic content. Untrusted text cannot supply this policy.
  const approved=new Set();
  const reopen=async()=>{await this.reopen();this.runtime.experience=await this.owner.MemoryService.initialize(this.root,this.runtime.root,undefined,{experience:{enabled:true},controllerRelevancePolicy:{version:'relevance/v1',calibrationDigest:'synthetic-diagnostic-lexical-v1',minLexicalCoverage:0.01,minSemanticSimilarity:1},consolidation:{review:async plan=>plan.actions.every(a=>a.kind==='retain'||a.kind==='conflict'||a.kind==='supersede'||a.record&&approved.has(a.record.content))?{digest:plan.digest,reviewer:'synthetic-fixture-host',reason:'Exact fixture evidence inspected'}:null}});};
  await reopen();let session=this.session(taskId,context.controller);
  let header=await session.startEpisode({startKey:taskId,goal:'Synthetic diagnostic owner lifecycle',sourceRefs:[]});
  const sourceRef=record=>({kind:'memory',id:record.id,revision:disclosure.memorySemanticRevision(record)});
  const refFor=record=>{const value=JSON.parse(record.content);return{id:value.id,memoryId:record.id,revision:disclosure.memorySemanticRevision(record),sourceId:value.sourceId,digest:hash(bytes(record))};};
  const snapshot=async(step)=>{
   const records=[];for(const [id,memoryId] of byId){const record=await this.runtime.experience.read(memoryId,false);if(record)records.push({ref:refFor(record),record});}
   const currentIds=new Set(temporal.selectTemporalCandidates(records.map(r=>r.record),new Date().toISOString()).map(c=>c.record.id));
   const procedures=await this.learning.procedures('agent-core');
   return{version:'memory-diagnostic-state/v1',runId:context.runId,taskId,afterStep:step,observedAt:new Date().toISOString(),scopeSentinelId:this.foreign.id,captured:structuredClone(captured),records,currentIds:records.filter(r=>currentIds.has(r.record.id)&&r.record.experience.epistemic==='fact').map(r=>r.ref.id),historicalIds:records.filter(r=>!currentIds.has(r.record.id)).map(r=>r.ref.id),retrieved:selected.map(h=>h.ref),retrieval:selected,support:procedures.filter(p=>p.name.startsWith('Diagnostic ')).map(p=>({candidateId:p.name.slice(11),supportTaskIds:p.supportTaskIds,independentTaskCount:p.supportTaskIds.length,procedure:p})),grantChanges:0};
  };
  for(let i=0;i<steps.length;i++){
   const step=steps[i];let operation={step:i,kind:step.kind,status:'success'};
   if(step.kind==='capture'){
    const body={id:step.id,value:step.value,sourceId:step.sourceId};const content=bytes(body);
    const captureReceipt=await session.captureEvidence({operationId:'capture-'+step.id,source:{kind:'controller-text',text:content,originRef:'synthetic:'+step.sourceId}});const source=captureReceipt.source;
    const artifactText=await fs.readFile(path.join(this.runtime.root,'archive/manifests/artifact-'+source.id+'.json'),'utf8');
    operation.captureReceipt=captureReceipt;operation.capturedArtifact={source,text:artifactText};
    captured.push({id:step.id,sourceId:step.sourceId,source,body,trust:step.trust});approved.add(content);
    const plan=await session.prepareConsolidation({episodeId:header.id,expectedRevision:header.revision,operationId:'prepare-'+step.id,proposal:{actions:[{actionId:'create-'+step.id,kind:'create',inputRefs:[source],reason:'Original synthetic fixture observation',value:{title:'Diagnostic '+step.id,content,keywords:['diagnostic',step.id,step.value],experience:{schemaVersion:1,kind:'note',retention:'durable',epistemic:step.trust==='verified-fixture'?'fact':'hypothesis',temporal:'dynamic',validity:{state:'known',from:{precision:'instant',value:step.effectiveAt},to:null},verification:{status:'unverified',evidence:[]},sourceRefs:[source]}}}]}});
    const receipt=await session.applyConsolidation({planId:plan.id,expectedPlanDigest:plan.digest,operationId:'apply-'+step.id});header={...header,revision:receipt.episodeRevision};byId.set(step.id,receipt.canonicalRefs[0].id);
    operation={...operation,ownerReceipt:receipt,promotionAudit:(await session.expand({source:receipt.auditRef,view:'evidence',budget:{maxBytes:65536}})).data};
    if(step.supersedes&&step.trust==='verified-fixture'){
     const predecessor=sourceRef(await this.runtime.experience.read(byId.get(step.supersedes),false)),successor=sourceRef(await this.runtime.experience.read(byId.get(step.id),false));
     const event=await session.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'correction-'+step.id,event:{kind:'correction',summary:'Verified synthetic correction',sourceRefs:[source,predecessor,successor],stateChanges:[],temporalAssertion:{kind:'correction',predecessor,successor,effectiveAt:step.effectiveAt,evidence:[source]}}});header={...header,revision:event.revision};
     const transition=await session.prepareConsolidation({episodeId:header.id,expectedRevision:header.revision,operationId:'transition-'+step.id,proposal:{actions:[{actionId:'transition-'+step.id,kind:'supersede',inputRefs:[event.eventRef],predecessor,successor,effectiveAt:step.effectiveAt,evidence:[event.eventRef],reason:'Verified synthetic correction'}]}});
     const changed=await session.applyConsolidation({planId:transition.id,expectedPlanDigest:transition.digest,operationId:'commit-transition-'+step.id});header={...header,revision:changed.episodeRevision};operation.transitionReceipt=changed;operation.transitionAudit=(await session.expand({source:changed.auditRef,view:'evidence',budget:{maxBytes:65536}})).data;
    }
   }else if(step.kind==='reopen'){
    await reopen();session=this.session(taskId,context.controller);const restored=await session.getTaskContext();header=restored.data.episode;operation.restoredEpisodeId=header.id;operation.restoredContext=restored.data;
   }else if(step.kind==='recall'){
    lastAsOf=step.asOf;selected=[];
    if(context.arm!=='off'){
     const recall=await session.recall({query:step.query,view:'abstract',limit:20,budget:{maxBytes:65536},...(step.asOf?{asOf:step.asOf}:{})});operation.recall={status:recall.status,warnings:recall.warnings,data:{hits:recall.data?.hits??[]}};
     for(const hit of recall.data?.hits??[]){if(![...byId.values()].includes(hit.id))continue;const expanded=await session.expand({source:{kind:'memory',id:hit.id,revision:hit.revision},view:'record',budget:{maxBytes:65536}});const record=JSON.parse(expanded.data.text);selected.push({ref:refFor(record),record,hit});}
    }
   }else if(step.kind==='answer'){
    const facts=selected.filter(h=>h.record.experience.epistemic==='fact'&&(step.answerMode==='historical'?Boolean(lastAsOf):!lastAsOf)).map(h=>JSON.parse(h.record.content)).sort((a,b)=>a.id.localeCompare(b.id));
    answer=step.answerMode==='abstain'?{kind:'abstain'}:{kind:'facts',facts};operation.answer=structuredClone(answer);
   }else if(step.kind==='review-consolidation'){
    const source=sourceRef(await this.runtime.experience.read(byId.get(step.candidateId),false));
    const plan=await session.prepareConsolidation({episodeId:header.id,expectedRevision:header.revision,operationId:step.operationId,proposal:{actions:[{actionId:'retain-'+step.candidateId,kind:'retain',inputRefs:[source],reason:'Bounded synthetic consolidation review'}]}});
    operation.planId=plan.id;
    if(step.decision==='accept-verified'){
     const receipt=await session.applyConsolidation({planId:plan.id,expectedPlanDigest:plan.digest,operationId:'apply-'+step.operationId});header={...header,revision:receipt.episodeRevision};operation.ownerReceipt=receipt;operation.promotionAudit=(await session.expand({source:receipt.auditRef,view:'evidence',budget:{maxBytes:65536}})).data;
     const reportPath=path.join(this.root,'work/verification.json'),report=await fs.readFile(reportPath,'utf8');
     const evidenceRefs=step.taskEvidenceIds.includes('task-verification')?['verification:'+reportPath+'#'+hash(report)]:[];
     operation.supportDecision=await this.learning.supportProcedure({taskId:context.runId,origin:context.controller,workspace:'agent-core',name:'Diagnostic '+step.candidateId,description:'Synthetic consolidation support deduplication',steps:['Inspect exact synthetic evidence','Check independent verification'],evidenceRefs,outcome:'verified'});
    }
   }
   trace.operations.push(operation);stepSnapshots.push(await snapshot(i));
  }
  return{answer,selected,trace,final:structuredClone(stepSnapshots.at(-1)),stepSnapshots};
 }

 async execute(spec,context){
  const started=performance.now(),taskId=context.runId,trace=[];
  const operation=async(name,action)=>{try{const result=await action();trace.push({operation:name,status:'success'});return result;}catch(error){trace.push({operation:name,status:'failure',reason:error.message});throw error;}};
  const work=path.join(this.root,'work');await fs.mkdir(work);
  const inputFile=path.join(work,'input.txt'),answerFile=path.join(work,'answer.txt');
  await fs.writeFile(inputFile,spec.input.document,{flag:'wx'});
  let session=this.session(taskId,context.controller);
  const episode=await operation('episode.start',()=>session.startEpisode({startKey:taskId,goal:'Synthetic '+spec.domain+' task correctness verification for '+spec.id,sourceRefs:[]}));
  await operation('learning.checkpoint',()=>this.checkpoint(taskId));
  const first=await operation('learning.status',()=>this.status());await operation('owners.reopen',()=>this.reopen());session=this.session(taskId,context.controller);
  const restored=await operation('episode.context',()=>session.getTaskContext());
  const pending=(await operation('learning.status',()=>this.status())).state.pendingReviews.some(item=>item.taskId===taskId);
  const duplicate=await operation('learning.checkpoint',()=>this.checkpoint(taskId));
  if(spec.family==='stale-evidence')await fs.writeFile(path.join(this.root,'seed-evidence.txt'),'Changed current evidence; old seed stale');
  const retrievalStarted=performance.now();
  const recall=context.arm==='off'?null:await operation('memory.recall',()=>session.recall({query:'Synthetic task-scoped seed',view:'abstract',limit:5,budget:{maxBytes:8192}}));
  const retrieval=performance.now()-retrievalStarted;
  const selected=recall?.data?.hits??[];
  if(recall){
   const records=await operation('ranking.read-canonical-fixture',()=>this.runtime.experience.list('agent-core'));
   const salience=this.config.policy==='fusion-feedback-v1'?await this.runtime.experience.feedbackSalienceMap():null;
   const options={limit:Math.max(1,records.length),maxNeighbors:0,...(salience?{rankingProfile:'fusion',feedbackSalience:salience}:{})};
   const expected=this.retrievalOwner.searchMemories(records,'Synthetic task-scoped seed',options,undefined,Math.max(1,records.length),Date.now()).slice(0,5);
   if(JSON.stringify(selected.map(hit=>hit.id))!==JSON.stringify(expected.map(hit=>hit.record.id))||selected.some((hit,index)=>Math.abs((hit.score??0)-expected[index].score)>0.0001))throw Error('BLOCKED:POLICY_RANKING_TRACE_MISMATCH');
  }
  const relevant=/reuse|relevant/.test(spec.family)&&!/irrelevant|negative/.test(spec.family);
  const hit=selected.find(item=>item.id===this.note.id);
  // The driver never receives oracle bytes. It uses only frozen task input and
  // advisory recall. Poison, stale and irrelevant records cannot alter grants.
  const document=await operation('driver.read-input',()=>context.readInput?context.readInput(work,inputFile):fs.readFile(inputFile,'utf8'));
  const {artifactText,applied}=scriptedAction(document,spec.domain,relevant&&Boolean(hit)&&hit.freshness!=='stale',hit?.abstract??'');
  await operation('driver.write-answer',()=>fs.writeFile(answerFile,artifactText,{flag:'wx'}));
  const oraclePath=context.oraclePath;
  const manifest={taskId,case:{path:oraclePath,digest:spec.oracleDigest},answerPath:answerFile};
  this.workflow.registerWorkflowVerification(manifest);this.memoryWorkflow.registerWorkflowVerification(manifest);
  await operation('verification.register-manifest',()=>this.learning.registerVerificationManifest(manifest));
  const oracle=JSON.parse(await operation('oracle.read-harness-only',()=>fs.readFile(oraclePath,'utf8')));
  if(hash(bytes(oracle))!==spec.oracleDigest)throw Error('BLOCKED:ORACLE_DIGEST_MISMATCH');
  // Even frozen historical owners only receive statically certified engineering
  // artifacts. Their old VM path is never allowed to inspect arbitrary code.
  if(spec.domain==='engineering')for(const test of oracle.tests)this.safeEngineering.evaluateEngineeringArtifact(artifactText,test.input);
  const verification=await operation('verification.recompute',()=>this.workflow.verifyWorkflowAnswer(oracle,artifactText));
  const ownedReport={verifierRevision:this.workflow.WORKFLOW_VERIFIER_REVISION,taskId,case:manifest.case,answer:{path:answerFile,digest:hash(artifactText)},...verification};
  const reportPath=path.join(work,'verification.json');await save(reportPath,ownedReport);
  const ownerVerification='verification:'+reportPath+'#'+hash(bytes(ownedReport));
  const ownerAction='file:'+answerFile+'#'+hash(artifactText);
  let receipt=null;
  if(hit){
   const recorded=await operation('memory.receipt',()=>this.runtime.experience.recordUseReceipt({taskId,useId:taskId+':use',memoryId:hit.id,contentDigest:hit.retrievalEvidence.contentDigest,retrievalAttemptId:hit.retrievalEvidence.attemptId,workspace:'agent-core',applicability:applied?'applied':'rejected',result:verification.verdict==='pass'?'success':'failure',reasonCode:applied?'scripted-branch-advisory-applied':'scripted-branch-advisory-rejected',actionRefs:[ownerAction],verificationRef:ownerVerification}));
   receipt={recorded,hit};
  }
  const decision=await operation('learning.review',()=>this.review(taskId));
  return {artifactText,verification,receipt,selected,trace,episodeId:episode.id,
   lifecycle:{capture:true,persist:first.state.pendingReviews.some(item=>item.taskId===taskId),restart:restored.data?.episodeRef?.id===episode.id&&pending,
    recall:context.arm==='off'||Boolean(recall),action:true,verification:true,receipt:context.arm==='off'||Boolean(receipt),review:Boolean(decision?.complete),
    compliant:Boolean(decision?.complete)&&pending&&duplicate.duplicate,harnessRecovered:false},
   violations:{scopeLeaks:selected.filter(item=>item.id===this.foreign.id).length,staleTrust:applied&&hit?.freshness==='stale'?1:0,unsupportedSuccess:0},
   latencyMs:{retrieval,total:performance.now()-started},counters:{toolCalls:trace.length,repeatedFailures:trace.filter((item,index)=>item.status==='failure'&&trace.slice(0,index).some(previous=>previous.status==='failure'&&previous.operation===item.operation)).length,injectedBytes:recall?.metrics?.payloadBytes??0,injectedTokenEstimate:recall?.metrics?.estimatedTokens??0,inferenceCalls:0}};
 }
}
export function scriptedAction(document,domain,reuse,advisory){
 if(domain==='engineering'){
  const reusable='rows => [...new Set(rows.map(row => row.key))].sort().flatMap(key => { const latest = rows.filter(row => row.key === key).sort((a,b) => b.sequence-a.sequence)[0]; return latest.deleted ? [] : [{key,value:latest.value}]; })';
  // Actual advisory use chooses the reusable ordering strategy. Input always
  // remains the current task authority; no code from untrusted Memory is run.
  const applied=reuse&&/latest|event|sequence|tombstone/i.test(advisory);
  const independent='rows => { const latest = new Map(); for (const row of rows) { const previous = latest.get(row.key); if (!previous || row.sequence > previous.sequence) latest.set(row.key, row); } return [...latest.values()].filter(row => !row.deleted).sort((a,b) => a.key.localeCompare(b.key)).map(row => ({key:row.key,value:row.value})); }';
  return {artifactText:applied?reusable:independent,applied};
 }
 const records=document.split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const applied=reuse&&/newest|memo|source|supersed/i.test(advisory);
 const map=new Map();
 if(applied){for(const row of [...records].sort((a,b)=>b.date.localeCompare(a.date)))if(!map.has(row.key))map.set(row.key,row);}
 else for(const row of records){const previous=map.get(row.key);if(!previous||row.date>previous.date)map.set(row.key,row);}
 const claims=[...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(row=>({key:row.key,value:row.value,source:row.source,contradictions:records.filter(old=>old.key===row.key&&old.source!==row.source).map(old=>old.source)}));
 return {artifactText:JSON.stringify(claims),applied};
}
