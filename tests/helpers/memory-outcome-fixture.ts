import {createHash} from 'node:crypto';
import {scriptedAction} from '../../scripts/verify/memory-outcome-adapter.mjs';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {freezeOutcomeSnapshot} from '../../scripts/verify/memory-outcome-eval.mjs';
export async function outcomeFixtureSnapshot(root:string,revision='test-built-snapshot'){
 const snapshot=path.join(root,'snapshot-'+revision);const seal=await freezeOutcomeSnapshot(process.cwd(),snapshot,revision);return {snapshot,seal};
}
export async function outcomeFixtureSuite(root:string){
 const suite=JSON.parse(await readFile(path.resolve('tests/fixtures/memory-outcome-v2/suite.json'),'utf8'));
 suite.sourceRevisions.current='test-built-snapshot';
 const file=path.join(root,'suite.json');await writeFile(file,JSON.stringify(suite),{flag:'wx'});return file;
}

/** Explicitly fabricated unit measurements for sidecar integration tests only. */
export async function outcomeFixtureDevelopment(suitePath:string,baselineRows:any[],output:string){
 const hash=(value:any)=>'sha256:'+createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
 const suite=JSON.parse(await readFile(suitePath,'utf8'));
 const observations=suite.cases.filter((item:any)=>item.partition==='development').flatMap((item:any)=>['native','external'].flatMap(controller=>['off','current'].map(arm=>{
  const base=baselineRows.find(row=>row.controller===controller&&row.arm===arm&&row.caseId.includes(item.domain)),row=structuredClone(base);
  const runId=item.id+':'+controller+':'+arm;Object.assign(row,{runId,caseId:item.id,taskId:runId});for(const key of ['inputDigest','oracleDigest','seedDigest','configDigest'])row.hashes[key]=item[key];
  row.evidence.artifactText=scriptedAction(item.input.document,item.domain,false,'').artifactText;
  row.evidence.verification={taskId:runId,artifactDigest:hash(row.evidence.artifactText),oracleDigest:item.oracleDigest,verdict:'pass',unsupportedClaims:0};
  row.evidence.receipts=[];row.receiptRefs=[];row.artifactRef='artifact:evidence/'+runId.replaceAll(':','-')+'.txt#'+hash(row.evidence.artifactText);row.verificationRef='verification:evidence/'+runId.replaceAll(':','-')+'-verification.json#'+hash(row.evidence.verification);
  row.cost={status:'unavailable',amount:null,currency:null,provenance:'fabricated unit fixture, no billing measurement'};return row;
 })));
 await writeFile(output,JSON.stringify(observations),{flag:'wx'});return output;
}
