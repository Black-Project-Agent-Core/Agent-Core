import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect,test} from 'vitest';
import {MemoryService} from '../../src/memory/service.js';
import {MemoryRetrievalLedger} from '../../src/memory/retrieval-ledger.js';
import {resolveMemoryPaths} from '../../src/memory/paths.js';

test('legacy retrieval retry ignores score key order but rejects changed values',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'legacy-ledger-order-'));
 try{
  await MemoryService.initialize(root,root);
  const ledger=new MemoryRetrievalLedger(resolveMemoryPaths(root,root)),now=new Date().toISOString();
  const attempt:any={version:1,attemptId:'score-order',surface:'memory_search',trigger:'explicit',startedAt:now,completedAt:now,retrievalStatus:'succeeded',deliveryStatus:'returned-to-controller',candidateCount:1,selectedCount:1,exposures:[{memoryId:'memory-source',rank:1,disposition:'selected',handoffStatus:'returned-to-controller',recordFingerprint:'sha256:'+'a'.repeat(64),scoreSummary:{semantic:0.8,lexical:0.4}}]};
  await ledger.record(attempt);
  const reordered={...attempt,exposures:[{...attempt.exposures[0],scoreSummary:{lexical:0.4,semantic:0.8}}]};
  expect((await ledger.record(reordered)).duplicate).toBe(true);
  await expect(ledger.record({...reordered,exposures:[{...reordered.exposures[0],scoreSummary:{lexical:0.9,semantic:0.8}}]})).rejects.toThrow('MEMORY_RETRIEVAL_ATTEMPT_CONFLICT');
 }finally{await rm(root,{recursive:true,force:true});}
});
