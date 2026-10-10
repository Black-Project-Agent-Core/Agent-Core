// Scripted, synthetic fixture adapter. No provider or host-config imports.
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {taskReviewDecision} from './cumulative-workflow-support.mjs';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const bytes=value=>JSON.stringify(value);
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes(value),{flag:'wx',mode:0o600});};
export class OutcomeMemoryAdapter{
 async initialize(root,seed,config){
  if(config.engineMode!=='experience-v2'||config.activation!=='synthetic-v2')throw Error('BLOCKED:V2_REQUIRED');
  this.safeEngineering=await import(new URL('../../dist/learning/outcome-safe-engineering.js',import.meta.url).href);
  this.root=root;this.config=config;await fs.mkdir(root,{recursive:false});
  this.host=await import(pathToFileURL(path.join(config.snapshotRoot,'dist/memory/host-runtime.js')).href);
  this.owner=await import(pathToFileURL(path.join(config.snapshotRoot,'SubProject/agent-core-memory/dist/index.js')).href);
  this.workflow=await import(pathToFileURL(path.join(config.snapshotRoot,'dist/learning/workflow-verifier.js')).href);
  this.memoryWorkflow=await import(pathToFileURL(path.join(config.snapshotRoot,'SubProject/agent-core-memory/dist/learning/workflow-verifier.js')).href);
  this.retrievalOwner=await import(pathToFileURL(path.join(config.snapshotRoot,'SubProject/agent-core-memory/dist/memory/retrieval.js')).href);
  this.learningOwner=await import(pathToFileURL(path.join(config.snapshotRoot,'dist/learning/service.js')).href);
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
