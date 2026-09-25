import { randomUUID } from 'node:crypto';

export type ToolInvocationOutcome='success'|'handled-failure';
export interface InvocationTracker {
  record(module:string,level:'info'|'success'|'warn'|'error'|'sys',message:string,kind?:string,context?:Record<string,unknown>):unknown;
  captureFailure(module:string,error:unknown,kind?:string,context?:Record<string,unknown>):unknown;
}
export interface ToolInvocationEvidence {
  readonly id:string;
  readonly processSessionId:string;
  finish(outcome:ToolInvocationOutcome,context?:Record<string,unknown>):boolean;
  fail(error:unknown,context?:Record<string,unknown>):boolean;
}

const PROCESS_SESSION_ID=randomUUID().replaceAll('-','');

export function beginToolInvocationEvidence(
  tracker:InvocationTracker,
  tool:string,
):ToolInvocationEvidence {
  const id=randomUUID().replaceAll('-',''),started=process.hrtime.bigint();
  let terminal=false;
  const base=()=>({tool,invocationId:id,processSessionId:PROCESS_SESSION_ID,invocationSource:'mcp-wrapper'});
  try{tracker.record('MCP','info',`${tool} started`,'tool-invocation-start',base());}catch{}

  const duration=()=>Number(process.hrtime.bigint()-started)/1_000_000;
  return {
    id,processSessionId:PROCESS_SESSION_ID,
    finish(outcome,context={}){
      if(terminal)return false;terminal=true;
      const merged={...context,...base(),outcome,durationMs:duration()};
      try{
        tracker.record(outcome==='handled-failure'?'OPERATION':'MCP',outcome==='handled-failure'?'info':'success',
          outcome==='handled-failure'?`${tool} operation failed`:`${tool} completed`,
          outcome==='handled-failure'?'handled-tool-failure':'tool-call',merged);
      }catch{}
      return true;
    },
    fail(error,context={}){
      if(terminal)return false;terminal=true;
      const merged={...context,...base(),outcome:'exception',durationMs:duration()};
      try{tracker.captureFailure('MCP',error,'tool-exception',merged);}catch{}
      return true;
    },
  };
}