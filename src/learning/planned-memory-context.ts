import { performance } from 'node:perf_hooks';
import type { ControllerMemoryDispatcher } from '../../SubProject/agent-core-memory/dist/memory/controller-protocol.js';
import type { Budgeted, RecallPage } from '../../SubProject/agent-core-memory/dist/memory/disclosure.js';
import {
  RETRIEVAL_LIMITS, createRetrievalBudget, reserveRetrievalCall, recordRetrievalBytes,
  mergeRetrievalObservations, markQuestionBlocked, parseRetrievalPlan,
  type RetrievalPlan, type RetrievalObservation, type MergedRetrieval,
} from './subquestion-retrieval.js';

const OUTPUT_LIMIT = 32_768;
export interface ContextMemoryRetrieval extends MergedRetrieval {
  version: 1;
  mode: 'subquestions';
  status: 'completed' | 'partial' | 'blocked';
  stopReason?: string;
  calls: Array<{questionId:string;callId:string;outcome:string;payloadBytes?:number}>;
  usage: {
    reservations:number; knownResponseBytes:number; receivedBytesStatus:'known'|'pending';
    elapsedMs:number; inFlightAtReturn:boolean; networkStopped:false;
    maxCalls:number; perCallBytes:number; totalBytes:number; minimumReservationBytes:number; deadlineMs:number;
  };
  omittedHits:number;
  advisory:string;
  deliveryConflicts?:string[];
}
const ADVISORY='Memory retrieval is advisory, not truth, sufficiency, permission, evidence-reviewed status, or measured benefit. No automatic expansion or retry.';
type Response = {result:Budgeted<RecallPage>;metrics:{payloadBytes:number}};
type Call = ContextMemoryRetrieval['calls'][number];
function invalidReason(error:unknown):string {
  const message=error instanceof Error?error.message:'';
  if (/^MEMORY_(CONTROLLER_SCOPE_UNAVAILABLE|SCOPE_MISMATCH)$/.test(message))return 'scope-unavailable';
  if (message==='MEMORY_INPUT_INVALID')return 'recall-input-invalid';
  if (message==='MEMORY_SOURCE_UNAVAILABLE')return 'memory-source-unavailable';
  if (message==='MEMORY_DISCLOSURE_LEDGER_UNAVAILABLE')return 'memory-ledger-unavailable';
  if (/RETRIEVAL_CLOCK/.test(message))return 'clock-invalid';
  return 'recall-unavailable';
}
function skeleton(plan:RetrievalPlan,start:number):ContextMemoryRetrieval {
  const ids=['root',...plan.questions.map(q=>q.id)];
  return {
    version:1,mode:'subquestions',status:'blocked',hits:[],revisionConflicts:[],
    coverage:ids.map(questionId=>({questionId,status:'unsearched'})),
    calls:[],usage:{reservations:0,knownResponseBytes:0,receivedBytesStatus:'known',
      elapsedMs:Math.max(0,performance.now()-start),inFlightAtReturn:false,networkStopped:false,
      maxCalls:1+plan.questions.length,perCallBytes:RETRIEVAL_LIMITS.callBytes,
      totalBytes:RETRIEVAL_LIMITS.totalBytes,minimumReservationBytes:RETRIEVAL_LIMITS.minBytes,
      deadlineMs:RETRIEVAL_LIMITS.elapsedMs},
    omittedHits:0,advisory:ADVISORY,
  };
}
export function blockedPlannedMemory(rawPlan:RetrievalPlan,reason:string):ContextMemoryRetrieval {
  const plan=parseRetrievalPlan(rawPlan);
  const output=skeleton(plan,performance.now());
  output.stopReason=reason;
  output.coverage=output.coverage.map(item=>({...item,status:'blocked',reason}));
  return output;
}
export function withinBudget(report:ContextMemoryRetrieval):ContextMemoryRetrieval {
  const original=new Set(report.coverage.filter(c=>c.status==='retrieved').map(c=>c.questionId));
  for (;;) {
    if(report.omittedHits) {
      const present=new Set(report.hits.flatMap(item=>item.questionIds));
      report.coverage=report.coverage.map(item=>original.has(item.questionId)&&!present.has(item.questionId)
        ? {...item,status:'gap',reason:'output-budget'}:item);
      if(report.status==='completed')report.status='partial';
    }
    if(Buffer.byteLength(JSON.stringify(report),'utf8')<=OUTPUT_LIMIT)return report;
    if(!report.hits.length)throw new Error('RETRIEVAL_OUTPUT_BUDGET_EXCEEDED');
    report.hits.pop();report.omittedHits++;
  }
}
/** Drop disclosure on scope drift without fabricating a zero-call invocation. */
export function discardPlannedMemory(report:ContextMemoryRetrieval,reason:string):ContextMemoryRetrieval {
  return {...report,status:'blocked',stopReason:reason,hits:[],revisionConflicts:[],deliveryConflicts:undefined,
    coverage:report.coverage.map(item=>({...item,status:'blocked',reason})), 
    omittedHits:report.omittedHits+report.hits.length};
}
function validResponse(value:unknown):value is Response {
  if(!value||typeof value!=='object')return false;
  const v=value as {result?:any;metrics?:any};
  if(!v.result||!['ok','partial','insufficient-budget'].includes(v.result.status))return false;
  if(!Number.isSafeInteger(v.metrics?.payloadBytes)||v.metrics.payloadBytes<0)return false;
  return v.result.status==='insufficient-budget'
    ||(v.result.data&&Array.isArray(v.result.data.hits)&&['complete','partial'].includes(v.result.data.completeness));
}
/** One bounded serialized invocation. Owner/session single-flight is enforced by ExternalControllerLearningService.
 * Timeout/abort only stop the wait; a backend recall may still settle and emit its canonical ledger entry.
 */
export async function runPlannedMemoryContext(input:{
  plan:RetrievalPlan; limit:number; dispatcher:ControllerMemoryDispatcher;
  scopeCheck:()=>Promise<void>; signal?:AbortSignal;
  trackInFlight:(pending:Promise<unknown>|undefined)=>void;
  observeUsage?:(read:()=>ContextMemoryRetrieval['usage'])=>void;
  onLateSettlement?:(value:{questionId:string;callId:string;outcome:string;payloadBytes?:number})=>Promise<void>;
}):Promise<ContextMemoryRetrieval> {
  const plan=parseRetrievalPlan(input.plan),start=performance.now();
  const budget=createRetrievalBudget(start),observations:RetrievalObservation[]=[];
  const calls:Call[]=[];
  let stopReason:string|undefined,inFlight=false;
  let knownResponseBytes=0,reservations=0;
  const questions=[{id:'root',query:plan.rootQuery},...plan.questions];
  const readUsage=():ContextMemoryRetrieval['usage']=>({reservations,knownResponseBytes,
    receivedBytesStatus:inFlight?'pending':'known',elapsedMs:Math.max(0,performance.now()-start),
    inFlightAtReturn:inFlight,networkStopped:false,maxCalls:questions.length,
    perCallBytes:RETRIEVAL_LIMITS.callBytes,totalBytes:RETRIEVAL_LIMITS.totalBytes,
    minimumReservationBytes:RETRIEVAL_LIMITS.minBytes,deadlineMs:RETRIEVAL_LIMITS.elapsedMs});
  input.observeUsage?.(readUsage);
  type Settled={kind:'ok';value:Response}|{kind:'error';reason:string};
  for(const question of questions) {
    if(input.signal?.aborted){stopReason='aborted';break;}
    try{await input.scopeCheck();}catch{stopReason='scope-changed';break;}
    // The scope await can itself outlive cancellation: do not dispatch afterwards.
    if(input.signal?.aborted){stopReason='aborted';break;}
    const reservation=reserveRetrievalCall(budget,'recall',performance.now());
    if(!reservation.allowed){stopReason=reservation.reason??'payload-budget';break;}
    reservations++;
    const callId=question.id+':1',call:Call={questionId:question.id,callId,outcome:'pending'};
    calls.push(call);inFlight=true;
    let abandoned=false,rawPending:Promise<unknown>;
    try { rawPending=input.dispatcher({method:'memory_recall',input:{query:question.query,
      view:'abstract',retention:'active-durable',limit:input.limit,budget:{maxBytes:reservation.maxBytes}}}); }
    catch(error){rawPending=Promise.reject(error);}
    // Meter at settlement, even when the caller has already stopped waiting.
    const pending:Promise<Settled>=rawPending.then((value):Settled=>{
      let bytes:number;
      try{bytes=Buffer.byteLength(JSON.stringify(value),'utf8');}
      catch{recordRetrievalBytes(budget,0);return {kind:'error',reason:'protocol-violation'};}
      knownResponseBytes+=bytes;call.payloadBytes=bytes;recordRetrievalBytes(budget,bytes);
      if(budget.protocolViolation||!validResponse(value)||value.metrics.payloadBytes!==bytes)
        return {kind:'error',reason:'protocol-violation'};
      return {kind:'ok',value};
    },(error):Settled=>{recordRetrievalBytes(budget,0);return {kind:'error',reason:invalidReason(error)};})
    .then(async settled=>{
      inFlight=false;
      if(abandoned)await input.onLateSettlement?.({questionId:question.id,callId,
        outcome:settled.kind==='error'?settled.reason:settled.value.result.status,
        ...(call.payloadBytes===undefined?{}:{payloadBytes:call.payloadBytes})}).catch(()=>undefined);
      return settled;
    });
    input.trackInFlight(pending);
    const settled=await new Promise<Settled|{kind:'deadline'}|{kind:'aborted'}>(resolve=>{
      let ended=false;
      const finish=(outcome:Settled|{kind:'deadline'}|{kind:'aborted'})=>{
        if(ended)return;ended=true;clearTimeout(timer);
        input.signal?.removeEventListener('abort',onAbort);
        if(outcome.kind==='deadline'||outcome.kind==='aborted')abandoned=true;
        resolve(outcome);
      };
      const onAbort=()=>finish({kind:'aborted'});
      const timer=setTimeout(()=>finish({kind:'deadline'}),Math.max(0,budget.deadlineMs-performance.now()));
      input.signal?.addEventListener('abort',onAbort,{once:true});
      if(input.signal?.aborted)finish({kind:'aborted'});
      void pending.then(finish,()=>finish({kind:'error',reason:'recall-unavailable'}));
    });
    if(settled.kind==='aborted'||settled.kind==='deadline') {
      call.outcome=settled.kind;stopReason=settled.kind;break;
    }
    input.trackInFlight(undefined);
    if(settled.kind==='error') {call.outcome=settled.reason;stopReason=settled.reason;break;}
    if(input.signal?.aborted||performance.now()>=budget.deadlineMs){
      stopReason=input.signal?.aborted?'aborted':'deadline';call.outcome=stopReason;break;
    }
    const response=settled.value.result;
    call.outcome=response.status;
    if(response.status==='insufficient-budget') {stopReason='insufficient-budget';break;}
    try{await input.scopeCheck();}catch{stopReason='scope-changed';break;}
    if(input.signal?.aborted||performance.now()>=budget.deadlineMs){
      stopReason=input.signal?.aborted?'aborted':'deadline';break;
    }
    observations.push({questionId:question.id,callId,result:response});
  }
  try{await input.scopeCheck();}catch{stopReason='scope-changed';}
  const merged=mergeRetrievalObservations(plan,observations);
  const completedIds=new Set(observations.map(x=>x.questionId));
  if(stopReason)for(const question of questions)if(!completedIds.has(question.id)) {
    merged.coverage=markQuestionBlocked(merged,question.id,stopReason).coverage;
  }
  let result:ContextMemoryRetrieval={...merged,version:1,mode:'subquestions',
    status:stopReason?(observations.length?'partial':'blocked')
      :merged.coverage.some(item=>item.status!=='retrieved'||Boolean(item.reason))?'partial':'completed',
    ...(stopReason?{stopReason}:{}),calls:calls.map(call=>({...call})),usage:readUsage(),
    omittedHits:0,advisory:ADVISORY};
  if(stopReason==='scope-changed'||stopReason==='scope-unavailable')result=discardPlannedMemory(result,stopReason);
  return withinBudget(result);
}
