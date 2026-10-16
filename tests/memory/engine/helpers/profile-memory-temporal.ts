/** Separate pure-function cost diagnosis. Build first; optional output path argument.
 * This is not a latency gate or an alternate implementation of temporal answers. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {selectTemporalCandidates} from '../../../../dist/memory/temporal.js';
import {legacyExperience} from '../../../../dist/memory/experience-types.js';
import {corpus, fixtureSeals} from './memory-eval.ts';
const results=[];
for(const n of corpus.workloads.lexicalRecordCounts){
  const records=Array.from({length:n},(_,i)=>({version:2,id:'lexical-'+String(i).padStart(4,'0'),content:(i===0?corpus.workloads.lexicalContent:'Distractor context '+i+' ')+corpus.workloads.lexicalPadding,links:[],provenance:{workspace:'agent-core',files:[]},experience:legacyExperience()}));
  const samples=[];
  for(let t=0;t<3;t++){
    const start=performance.now(),out=selectTemporalCandidates(records as any,'2026-10-07T00:00:00Z');
    samples.push(performance.now()-start);assert.equal(out.length,n);assert(out.every(c=>c.certainty==='unknown'&&!c.conflicted&&!c.invalidatedBy.length));
  }
  const original=globalThis.structuredClone;let calls=0;
  try{
    globalThis.structuredClone=(...args)=>{calls++;return original(...args);};
    const start=performance.now();selectTemporalCandidates(records as any,'2026-10-07T00:00:00Z');
    results.push({records:n,unmodifiedTemporalMs:samples,instrumentedMs:performance.now()-start,structuredCloneCalls:calls});
  }finally{globalThis.structuredClone=original;}
}
const report={schemaVersion:1,datasetRevision:corpus.datasetRevision,fixtureSeals,
  note:'Separate pure-function synthetic diagnosis, not guardrail samples. Same epistemic/temporal/workspace/link shape as sealed public-batch corpus; no I/O or production mutation. Initial JIT included in first of three samples.',results};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
