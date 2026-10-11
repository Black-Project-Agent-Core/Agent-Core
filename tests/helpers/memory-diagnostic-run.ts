import fs from 'node:fs/promises';
import path from 'node:path';
import {OutcomeMemoryAdapter} from '../../scripts/verify/memory-outcome-adapter.mjs';
import {outcomeDigest} from '../../src/learning/outcome-contract.js';
export const BASELINE=process.env.MEMORY_DIAGNOSTIC_SNAPSHOT??process.cwd();
export const capture=(id:string,value:string,sourceId=id+'-memo',extra={})=>({kind:'capture',id,value,sourceId,effectiveAt:'2025-01-01T00:00:00Z',trust:'verified-fixture',...extra});
export function caseFor(steps:any[],oracle:any,diagnosticFamily='recall-extraction',integrity?:any){return {caseId:'heldout-research-relevant-reuse',diagnosticFamily,steps,oracle,...(integrity?{integrity}:{})};}
export const oracleFor=(ids:string[],values:string[]=ids)=>({expectedPreservedIds:ids,expectedRetrievedIds:ids,expectedAnswer:{kind:'facts',facts:ids.map((id,i)=>({id,value:values[i],sourceId:id+'-memo'}))},forbiddenIds:[]});
export async function runDiagnostic(item:any,arm='current'){
 const parent=await fs.mkdtemp(path.resolve('runtime/tmp/diagnostic-test-'));const output=path.join(parent,'report');await fs.mkdir(output);const suite=JSON.parse(await fs.readFile('tests/fixtures/memory-outcome-v2/suite.json','utf8'));const spec=suite.cases.find((c:any)=>c.id===item.caseId);const oraclePath=path.join(parent,'oracle.json');await fs.writeFile(oraclePath,JSON.stringify(spec.oracle));
 const adapter=new OutcomeMemoryAdapter();await adapter.initialize(path.join(parent,'store'),spec.seed,{engineMode:'experience-v2',activation:'synthetic-v2',policy:'baseline-v1',snapshotRoot:BASELINE});
 try{const result=await adapter.executeDiagnostic(spec,{runId:item.caseId+':native:'+arm,controller:'native',arm,oraclePath,output},item);return {parent,output,adapter,...result};}catch(error){await fs.rm(parent,{recursive:true,force:true});throw error;}
}
export const bytes=(v:any)=>Buffer.from(JSON.stringify(v));
export function rehashRef(ref:string,value:any){return ref.split('#')[0]+'#'+outcomeDigest(JSON.stringify(value));}
