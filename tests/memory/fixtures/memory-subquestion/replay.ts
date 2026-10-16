/** Synthetic test-only controller. No production MCP registration or model calls. */
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {initializeMemoryRoot} from '../../../../dist/memory/initialize.js';
import {memorySemanticRevision} from '../../../../dist/memory/disclosure.js';
import type {Budgeted,ExpansionPage,RecallPage,SourceRef} from '../../../../dist/memory/disclosure.js';
import {registerMemoryExperienceTools} from '../../../../src/memory/mcp/experience-tools.js';
import {createRetrievalBudget,markEvidenceReviewed,markQuestionBlocked,mergeRetrievalObservations,parseRetrievalPlan,recordRetrievalBytes,reserveRetrievalCall} from '../../../../src/memory/subquestion-retrieval.js';
import type {RetrievalObservation,RetrievalPlan} from '../../../../src/memory/subquestion-retrieval.js';
const fixtures:Fixture[]=[],drivers:ScriptedRetrieval[]=[];let evidenceIndex=0;
export async function createFixture(){
 const suite=JSON.parse(await readFile(new URL('./suite.json',import.meta.url),'utf8'));
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-subquestion-'));
 const memory=await initializeMemoryRoot({baseDir:root,memoryRoot:path.join(root,'synthetic-memory'),experience:{enabled:true}});
 const records:Record<string,any>={},sourceFiles:Record<string,string>={},oracle:Record<string,SourceRef&{questionIds:string[]}>= {};
 for(const spec of suite.records){
  if(spec.file){sourceFiles[spec.key]=path.join(root,spec.file);await writeFile(sourceFiles[spec.key],spec.content);}
  const record=await memory.remember({title:spec.title,content:spec.content,keywords:spec.title.split(' '),provenance:{workspace:spec.workspace,files:spec.file?[spec.file]:[]}});
  records[spec.key]=record;oracle[spec.key]={kind:'memory',id:record.id,revision:memorySemanticRevision(record),questionIds:spec.oracleQuestions};
 }
 const binding={workspaceKey:'agent-core',taskId:'synthetic-task-a',controllerId:'synthetic-controller'};
 const tools=new Map<string,{schema:z.ZodType;call:(args:unknown)=>Promise<any>}>();
 const f={root,memory,records,sourceFiles,oracle,binding,suite,plan:parseRetrievalPlan(suite.plan),authorized:true,tools};fixtures.push(f);
 registerMemoryExperienceTools({registerTool:(name:string,meta:any,call:any)=>tools.set(name,{schema:z.strictObject(meta.inputSchema),call})} as any,memory,async selector=>{
  if(!f.authorized||selector?.taskId!==f.binding.taskId)throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  return {...f.binding};
 });
 return f;
}
export type Fixture=Awaited<ReturnType<typeof createFixture>>;
export interface CallTrace {action:'recall'|'expand';questionId:string;callId:string;maxBytes:number;bytes:number;code?:string;late?:boolean;networkStopped?:false;source?:SourceRef;result?:unknown}
export class ScriptedRetrieval {
 readonly budget=createRetrievalBudget(0);readonly observations:RetrievalObservation[]=[];readonly trace:CallTrace[]=[];
 bootstrapCalls=0;bootstrapBytes=0;nowMs=0;nextFailure?:'transient'|'timeout'|'late'|'oversize';
 private retried=false;private blocked=new Map<string,string>();private reviews:Array<{source:SourceRef;questionIds:string[]}>=[];
 constructor(readonly fixture:Fixture,readonly plan:RetrievalPlan=fixture.plan){drivers.push(this);}
 async bootstrap(){
  const tool=this.fixture.tools.get('memory_v2_read')!;
  const args=tool.schema.parse({action:'capabilities',scope:{taskId:this.fixture.binding.taskId},payload:{}});
  const output=await tool.call(args);this.bootstrapCalls++;this.bootstrapBytes+=Buffer.byteLength(output.content[0].text);
  if(output.isError)throw Error('FIXTURE_CAPABILITIES_BLOCKED');
 }
 totalBytes(){return this.trace.reduce((total,call)=>total+call.bytes,0);}
 merged(){
  let merged=mergeRetrievalObservations(this.plan,this.observations);
  for(const [id,reason] of this.blocked)merged=markQuestionBlocked(merged,id,reason);
  for(const review of this.reviews)merged=markEvidenceReviewed(merged,review.source,review.questionIds);
  return merged;
 }
 async recall(questionId:string,options:Record<string,unknown>={}){
  const query=questionId==='root'?this.plan.rootQuery:this.plan.questions.find(q=>q.id===questionId)?.query;
  if(!query)throw Error('RETRIEVAL_QUESTION_UNKNOWN');
  await this.call('recall',questionId,{query,view:'abstract',limit:4,...options});
 }
 async expand(source:SourceRef,questionIds:string[]){await this.call('expand',questionIds[0],{source:{kind:source.kind,id:source.id,revision:source.revision},view:'record'},questionIds);}
 private async call(action:'recall'|'expand',questionId:string,payload:Record<string,unknown>,questionIds=[questionId]):Promise<void>{
  const reservation=reserveRetrievalCall(this.budget,action,this.nowMs);
  if(!reservation.allowed){for(const id of questionIds)this.blocked.set(id,reservation.reason!);return;}
  const callId='call-'+(this.trace.length+1),call:CallTrace={action,questionId,callId,maxBytes:reservation.maxBytes,bytes:0,...(action==='expand'?{source:payload.source as SourceRef}:{})};this.trace.push(call);
  const failure=this.nextFailure;this.nextFailure=undefined;
  if(failure==='timeout'){recordRetrievalBytes(this.budget,0);call.code='timeout';for(const id of questionIds)this.blocked.set(id,'timeout');return;}
  const tool=this.fixture.tools.get('memory_v2_read')!;
  const args=tool.schema.parse({action,scope:{taskId:this.fixture.binding.taskId},payload:{...payload,budget:{maxBytes:reservation.maxBytes}}});
  const output=failure==='transient'?{isError:true,content:[{type:'text',text:JSON.stringify({status:'error',code:'TRANSIENT_FIXTURE_UNAVAILABLE'})}]}:await tool.call(args);
  const text=failure==='oversize'?JSON.stringify({oversized:'x'.repeat(reservation.maxBytes)}):output.content[0].text;
  call.bytes=Buffer.byteLength(text);recordRetrievalBytes(this.budget,call.bytes);
  if(this.budget.protocolViolation){call.code='protocol-violation';for(const id of questionIds)this.blocked.set(id,call.code);return;}
  const response=JSON.parse(text);call.result=response;
  if(failure==='late')this.nowMs=this.budget.deadlineMs;
  if(this.nowMs>=this.budget.deadlineMs){call.code='late-settlement';call.late=true;call.networkStopped=false;for(const id of questionIds)this.blocked.set(id,call.code);return;}
  if(output.isError){
   call.code=response.code;
   if(response.code==='TRANSIENT_FIXTURE_UNAVAILABLE'&&!this.retried){this.retried=true;await this.call(action,questionId,payload,questionIds);return;}
   for(const id of questionIds)this.blocked.set(id,response.code);return;
  }
  if(action==='recall')this.observations.push({questionId,callId,result:response.result as Budgeted<RecallPage>});
  else {
   const result=response.result as Budgeted<ExpansionPage>;
   if(result.status==='insufficient-budget'||result.data.availability!=='available'||result.data.nextCursor){for(const id of questionIds)this.blocked.set(id,result.status==='insufficient-budget'?'insufficient-budget':'expansion-incomplete');return;}
   // This fixture reviews only whole available exact-revision expansions. It does
   // not infer truth, current applicability, usefulness or controller compliance.
   this.reviews.push({source:result.data.source,questionIds});
  }
 }
}
export async function cleanupFixtures(){
 const destination=process.env.SUBQUESTION_EVIDENCE_DIR;
 if(destination&&drivers.length){await mkdir(destination,{recursive:true});await writeFile(path.join(destination,'replay-'+String(++evidenceIndex).padStart(2,'0')+'.json'),JSON.stringify({synthetic:true,clock:'injected-monotonic',liveControllers:'NOT RUN',runs:drivers.splice(0).map(driver=>({plan:driver.plan,bootstrap:{calls:driver.bootstrapCalls,bytes:driver.bootstrapBytes},budget:driver.budget,trace:driver.trace,observations:driver.observations,merged:driver.merged(),oracle:driver.fixture.oracle}))},null,2));}else drivers.splice(0);
 for(const f of fixtures.splice(0))await rm(f.root,{recursive:true,force:true});
}
